import { Configuration, OpenAIApi } from 'openai';
const {PineconeClient} = require('@pinecone-database/pinecone');

const OPENAI_CONFIG = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const OPENAI_CLIENT = new OpenAIApi(OPENAI_CONFIG);

const pinecone = new PineconeClient();


const MODEL = 'text-embedding-ada-002';
const INDEX_NAME = 'recipes';

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

export default async function (req, res) {
  if (!OPENAI_CONFIG.apiKey) {
    res.status(500).json({
      error: {
        message: 'OpenAI API key not configured, please follow instructions in README.md',
      }
    });
    return;
  }

  const query = req.body.query || '';
  if (query.trim().length === 0) {
    res.status(400).json({
      error: {
        message: 'Please enter a valid query',
      }
    });
    return;
  }

  try {
    console.log(OPENAI_CLIENT);
    const q = await OPENAI_CLIENT.createEmbedding({
      model: MODEL,
      input: [query],
    });

    const {data: openAIData} = q;
    const {data} = openAIData;

    const vector = data[0].embedding;

    await pinecone.init({
      environment: 'us-east1-gcp',
      apiKey: process.env.PINECONE_API_KEY,
    });

    const index = pinecone.Index(INDEX_NAME);

    const resp = await index.query({
      vector,
      topK: 5,
      includeMetadata: true,
    });

    const {data: pinecodeData} = resp;
    const {matches} = pinecodeData;

    console.log(matches);
    res.status(200).json({ matches });
  } catch(error) {
    // Consider adjusting the error handling logic for your use case
    if (error.response) {
      console.error(error.response.status, error.response.data);
      res.status(error.response.status).json(error.response.data);
    } else {
      console.error(`Error with OpenAI API request: ${error.message}`);
      res.status(500).json({
        error: {
          message: 'An error occurred during your request.',
        }
      });
    }
  }
}
