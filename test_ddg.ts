import { DuckDuckGoSearchGateway } from "./src/frameworks/network/DuckDuckGoSearchGateway";

async function run() {
  const gw = new DuckDuckGoSearchGateway();
  const res = await gw.search("quantum computing (site:wikipedia.org OR site:nature.com)");
  console.log("Multi-site:");
  console.log(res);

  const res2 = await gw.search("quantum computing site:wikipedia.org");
  console.log("Single site:");
  console.log(res2);
}

run();
