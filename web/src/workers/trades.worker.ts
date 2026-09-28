/// <reference lib="webworker" />
/** Runs the trade search off the main thread so the page never freezes. */
import { runSearch, type SearchRequest } from "../lib/tradeSearch";

self.onmessage = (event: MessageEvent<SearchRequest>) => {
  self.postMessage(runSearch(event.data));
};
