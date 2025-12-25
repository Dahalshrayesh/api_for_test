const express = require("express");
const Parser = require("rss-parser");
const axios = require("axios");
const cheerio = require("cheerio");
const cors = require("cors");

const app = express();
const parser = new Parser({
  customFields: {
    item: ["media:content", "enclosure", "content:encoded"]
  }
});

app.use(cors());

// ================= FEEDS =================
const FEEDS = [
  { name: "Baahrakhari", url: "https://baahrakhari.com/feed" },
  { name: "OnlineKhabar", url: "https://www.onlinekhabar.com/feed" },
  { name: "Ratopati", url: "https://www.ratopati.com/feed" },
  { name: "Setopati", url: "https://www.setopati.com/feed" },
  { name: "ThahaKhabar", url: "https://www.thahakhabar.com/feed" },
  { name: "NepalSamaya", url: "https://nepalsamaya.com/feed" },
  { name: "Rajdhani", url: "https://rajdhanidaily.com/feed" },
  { name: "NewsOfNepal", url: "https://newsofnepal.com/feed" },
  { name: "BizMandu", url: "https://bizmandu.com/feed" },
  { name: "Techpana", url: "https://techpana.com/feed" },
  { name: "SwasthyaKhabar", url: "https://swasthyakhabar.com/feed" },
  { name: "Nagarik News", url: "https://nagariknews.nagariknetwork.com/feed" },
  { name: "BBC Nepali", url: "https://www.bbc.com/nepali/index.xml" }
];

// ================= CATEGORY MAP =================
const SOURCE_CATEGORY = {
  Techpana: "tech",
  SwasthyaKhabar: "health",
  "BBC Nepali": "international"
};

// ================= HELPERS =================
function cleanText(text = "") {
  return text.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function cleanPubDate(pubDate = "") {
  return pubDate.replace(/[\n\r\t]/g, " ").trim();
}

// ================= IMAGE FETCH =================
async function fetchArticleImage(url, contentHtml = "") {
  try {
    const { data } = await axios.get(url, { timeout: 8000 });
    const $ = cheerio.load(data);

    // 1️⃣ OpenGraph / Twitter
    const ogImage =
      $('meta[property="og:image"]').attr("content") ||
      $('meta[name="twitter:image"]').attr("content");
    if (ogImage) return ogImage;

    // 2️⃣ First image in article
    const articleImg = $("article img").first().attr("src");
    if (articleImg) return articleImg;

    // 3️⃣ Any image in HTML
    const anyImg = $("img").first().attr("src");
    if (anyImg) return anyImg;

    // 4️⃣ Fallback from content:encoded
    if (contentHtml) {
      const $c = cheerio.load(contentHtml);
      const contentImg = $c("img").first().attr("src");
      if (contentImg) return contentImg;
    }

    return "";
  } catch (e) {
    console.log("❌ Failed to fetch image:", url, e.message);
    return "";
  }
}

// ================= CACHE =================
let CACHE = { data: null, time: 0 };
const CACHE_DURATION = 10 * 60 * 1000;

// ================= ROUTE =================
app.get("/news", async (req, res) => {
  try {
    let requestedCategory = req.query.category || null;

    // Use cache
    if (CACHE.data && Date.now() - CACHE.time < CACHE_DURATION) {
      let result = CACHE.data;
      if (requestedCategory && requestedCategory !== "general") {
        result = result.filter(a => a.category === requestedCategory);
      }
      return res.json({
        status: "ok",
        totalResults: result.length,
        articles: result
      });
    }

    let articles = [];

    await Promise.all(
      FEEDS.map(async feed => {
        try {
          const feedData = await parser.parseURL(feed.url);
          const items = feedData.items.slice(0, 6);

          const feedArticles = await Promise.all(
            items.map(async item => {
              // ✅ Prefer RSS media first
              let image =
                item.enclosure?.url ||
                item["media:content"]?.url ||
                "";

              // ✅ Fallback to article / content
              if (!image && item.link) {
                image = await fetchArticleImage(item.link, item["content:encoded"] || "");
              }

              const category = SOURCE_CATEGORY[feed.name] || "general";

              return {
                source: { id: null, name: feed.name },
                category,
                title: cleanText(item.title),
                description: cleanText(item.contentSnippet || ""),
                url: item.link,
                urlToImage: image || null,
                publishedAt: new Date(cleanPubDate(item.pubDate)).toISOString(),
                content: cleanText(item.content || "")
              };
            })
          );

          articles.push(...feedArticles);
        } catch {
          console.log(`❌ Failed: ${feed.name}`);
        }
      })
    );

    articles.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

    // Save to cache
    CACHE = { data: articles, time: Date.now() };

    // Filter requested category (general = all news)
    if (requestedCategory && requestedCategory !== "general") {
      articles = articles.filter(a => a.category === requestedCategory);
    }

    res.json({
      status: "ok",
      totalResults: articles.length,
      articles
    });
  } catch (e) {
    res.status(500).json({ status: "error", message: "Failed to fetch news" });
  }
});

// ================= START =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`✅ News API running → http://localhost:${PORT}/news`)
);
