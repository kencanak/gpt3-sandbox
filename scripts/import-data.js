require('cross-fetch/polyfill');
require('dotenv').config();

const {createReadStream} = require('fs');
const csvParser = require('csv-parser');
const {PineconeClient} = require('@pinecone-database/pinecone');

const {Configuration, OpenAIApi } = require('openai');

const OPENAI_CONFIG = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const OPENAI_CLIENT = new OpenAIApi(OPENAI_CONFIG);

const INDEX_NAME = 'recipes';

const FILE = './data/RAW_recipes.csv';

const MODEL = 'text-embedding-ada-002';

const parseRecipe = () => {
  return new Promise((resolve, reject) => {
    const data = [];
    createReadStream(FILE)
      .on('error', (err) => {
        reject(err);
      })
      .pipe(csvParser())
      .on('data', (row) => {
        data.push(row);
      })
      .on('end', () => {
        resolve(data);
      });
  });
};

const getEmbeddings = async (input) => {
  const embeddingsRes = await OPENAI_CLIENT.createEmbedding({
    model: MODEL,
    input,
  });

  const embeddings = embeddingsRes.data.data.map((temp) => {
    return temp.embedding;
  });

  return embeddings;
};

const batchTask = (tasks = [], taskLength = 500) => {
  const totalBatch = Math.ceil(tasks.length / taskLength);

  const batches = [];
  for (let i = 0; i < totalBatch; i++) {
    batches.push(tasks.slice(i * taskLength, (i + 1) * taskLength));
  }

  return batches;
};

function getMatches(string, regex, index) {
  index || (index = 1); // default to the first capturing group
  var matches = [];
  var match;

  while (match = regex.exec(string)) {
    matches.push(match[index]);
  }
  return matches;
}

(async () => {
  const pinecone = new PineconeClient();
  await pinecone.init({
    environment: 'us-east1-gcp',
    apiKey: process.env.PINECONE_API_KEY,
  });

  const {data: indexes} = await pinecone.listIndexes();

  if (!indexes.includes(INDEX_NAME)) {
    // create index if doesn't exists
    // we need to create embeddings with ADA model similarity
    // so we need to get the dimensions value
    const embeddings = await getEmbeddings(
      [
        'Sample document text goes here',
        'there will be several phrases in each batch',
      ]
    );

    const embeddingDimension = embeddings[0].length;

    // id
    // name
    // minutes
    // tags
    // nutrition
    // n_steps
    // steps
    // description

    await pinecone.createIndex({
      name: INDEX_NAME,
      dimension: embeddingDimension,
      metadata_config: {
        indexed: ['name', 'description'],
      },
    });
  }

  const index = pinecone.Index(INDEX_NAME);

  // get recipes
  // we only want to insert first 10000
  const rawRecipes = await parseRecipe();

  const recipes = [...rawRecipes.slice(0, 1600)];

  // we want to do a batch upsert of 32 items
  const batches = batchTask(recipes, 32);

  for (const batch of batches) {
    await Promise.all(batch.map(async (recipe) => {
      const {id, tags: tagsRaw, description, name, minutes, steps: stepsRaw, ingredients: ingredientsRaw} = recipe;

      const myRegEx = /(?:'+(.*?)'+|"+(.*?)"+,?)/g;
      const tags = getMatches(tagsRaw, myRegEx, 1).filter((tag) => tag);
      const steps = getMatches(stepsRaw, myRegEx, 1).filter((step) => step);
      const ingredients = getMatches(ingredientsRaw, myRegEx, 1).filter((ingredient) => ingredient);

      const metadata = {
        tags,
        description,
        name,
        minutes,
        steps,
        ingredients,
      };

      const inputQueries = [
        name,
        ...tags,
        ...steps,
        ...ingredients,
        `done in ${minutes} minutes`,
        `time taken ${minutes} minutes`,
        `${minutes} minutes`,
      ];

      if (description) {
        inputQueries.push(description);
      }

      const embeddings = await getEmbeddings(
        inputQueries.filter((q) => q)
      );

      await index.upsert({
        vectors: embeddings.map((embedding, i) => {
          return {
            id,
            values: embedding,
            metadata,
          };
        }),
      });

      return Promise.resolve();
    }));
  };
})();

