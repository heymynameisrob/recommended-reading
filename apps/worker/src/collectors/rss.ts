import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { Source } from "@archive/core";
import type { CollectedItem } from "./types";
import { fetchSourceText, hashEntry, parsePublishedAt, resolveArticleUrl } from "./http";

type XmlNode = Record<string, unknown>;

/** Read an XML object without assuming the shape of third-party feed data. */
function node(value: unknown): XmlNode {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as XmlNode)
    : {};
}

/** Normalize optional and repeated XML elements. */
function entries(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/** Read plain text, CDATA, or an element with attributes and text. */
function text(value: unknown): string {
  if (typeof value === "string") return value.trim();
  return typeof node(value)["#text"] === "string" ? String(node(value)["#text"]).trim() : "";
}

/** Find an Atom alternate link or a plain RSS link. */
function articleLink(entry: XmlNode, base: string) {
  for (const value of entries(entry.link)) {
    const link = node(value);
    const relation = text(link["@_rel"]);
    if (relation && relation !== "alternate") continue;
    const resolved = resolveArticleUrl(text(link["@_href"]) || text(value), base);
    if (resolved) return resolved;
  }
  return undefined;
}

/** Parse RSS 2.0, RDF/RSS 1.0, and Atom XML without a browser or an LLM. */
export async function collectRss(source: Source): Promise<CollectedItem[]> {
  if (new URL(source.url).protocol !== "https:") throw new Error("Only HTTPS feeds are supported");
  const xml = await fetchSourceText(source.url, {
    Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
  });
  if (/<!DOCTYPE|<!ENTITY/i.test(xml))
    throw new Error("Feed document types and entity declarations are not supported");
  if (XMLValidator.validate(xml) !== true) throw new Error("Feed response is not valid XML");

  const parser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: true,
    processEntities: true,
  });
  const document = node(parser.parse(xml));
  const channel = node(node(document.rss).channel);
  const atom = node(document.feed);
  const rdf = node(document.RDF);
  let feedEntries: unknown[];
  if (document.rss !== undefined && node(document.rss).channel !== undefined) {
    feedEntries = entries(channel.item);
  } else if (document.feed !== undefined) {
    feedEntries = entries(atom.entry);
  } else if (document.RDF !== undefined) {
    feedEntries = entries(rdf.item);
  } else {
    throw new Error("Response is not an RSS or Atom feed");
  }

  const items: CollectedItem[] = [];
  for (const value of feedEntries.slice(0, 200)) {
    const entry = node(value);
    const externalId = text(entry.guid) || text(entry.id) || text(entry["@_about"]);
    const guid = node(entry.guid);
    const permalink = guid["@_isPermaLink"] === "false" ? "" : text(entry.guid);
    const url =
      articleLink(entry, source.url) ||
      (permalink ? resolveArticleUrl(permalink, source.url) : undefined) ||
      source.url;
    const content = (
      text(entry.encoded) ||
      text(entry.content) ||
      text(entry.description) ||
      text(entry.summary)
    ).slice(0, 100_000);
    const title = (text(entry.title) || content.slice(0, 160) || "Untitled feed entry").slice(
      0,
      1000,
    );
    const author =
      text(node(entry.author).name) || text(entry.author) || text(entry.creator) || undefined;
    const publishedAt = parsePublishedAt(
      text(entry.pubDate) || text(entry.published) || text(entry.date) || text(entry.updated),
    );
    if (!externalId && url === source.url && !content && title === "Untitled feed entry") continue;
    items.push({
      url,
      title,
      content,
      author,
      publishedAt,
      externalId: externalId || url,
      contentHash: await hashEntry({ externalId, url, title, content, author, publishedAt }),
      artifacts: [],
    });
  }
  return items;
}
