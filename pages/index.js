import Head from "next/head";
import { useState } from "react";
import styles from "./index.module.css";

export default function Home() {
  const [recipeInput, setRecipeInput] = useState("");
  const [result, setResult] = useState();

  async function onSubmit(event) {
    event.preventDefault();
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: recipeInput }),
      });

      const data = await response.json();
      if (response.status !== 200) {
        throw data.error || new Error(`Request failed with status ${response.status}`);
      }

      setResult(data.matches);
      // setRecipeInput("");
    } catch(error) {
      // Consider implementing your own error handling logic here
      console.error(error);
      alert(error.message);
    }
  }

  return (
    <div>
      <Head>
        <title>OpenAI Quickstart</title>
        <link rel="icon" href="/dog.png" />
      </Head>

      <main className={styles.main}>
        <img src="/cooking.png" className={styles.icon} />
        <h3>find recipe</h3>
        <form onSubmit={onSubmit}>
          <input
            type="text"
            name="animal"
            placeholder="search for recipe"
            value={recipeInput}
            onChange={(e) => setRecipeInput(e.target.value)}
          />
          <input type="submit" value="Find recipe" />
        </form>
        <ul className={styles.result}>
          {result && result.length && result.map((item) => {
            return (
              <li>
                name: {item.metadata.name}<br/>
                desc: {item.metadata.description}<br/>
                time taken: {item.metadata.minutes} minutes<br/>
                tags: <br/>
                <ul>
                  {item.metadata.tags.map((tag) => {
                    return (
                      <li>{tag}</li>
                    )
                  })}
                </ul>
                ingredients: <br/>
                <ul>
                  {item.metadata.ingredients.map((ingredient) => {
                    return (
                      <li>{ingredient}</li>
                    )
                  })}
                </ul>
                steps: <br/>
                <ul>
                  {item.metadata.steps.map((step) => {
                    return (
                      <li>{step}</li>
                    )
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
      </main>
    </div>
  );
}
