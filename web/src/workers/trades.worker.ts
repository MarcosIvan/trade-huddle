/// <reference lib="webworker" />
/** Runs the trade search off the main thread so the page never freezes. */
import { runFinder, runSearch, type FinderRequest, type SearchRequest } from "../lib/tradeSearch";

self.onmessage = (event: MessageEvent<SearchRequest | FinderRequest>) => {
  const data = event.data;
  self.postMessage("finder" in data ? runFinder(data) : runSearch(data));
};
