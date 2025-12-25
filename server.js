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
  { name: "Baahrakhari", url: "https://baahrakhari.com/feed", profile: "" },
  { name: "OnlineKhabar", url: "https://www.onlinekhabar.com/feed", profile: "https://www.ashesh.org/app/news/logo/onlinekhabar.jpg" },
  { name: "Ratopati", url: "https://www.ratopati.com/feed", profile: "" },
  { name: "Setopati", url: "https://www.setopati.com/feed", profile: "https://www.ashesh.org/app/news/logo/setopati.jpg" },
  { name: "ThahaKhabar", url: "https://www.thahakhabar.com/feed", profile: "" },
  { name: "NepalSamaya", url: "https://nepalsamaya.com/feed", profile: "" },
  { name: "Rajdhani", url: "https://rajdhanidaily.com/feed", profile: "" },
  { name: "NewsOfNepal", url: "https://newsofnepal.com/feed", profile: "" },
  { name: "BizMandu", url: "https://bizmandu.com/feed", profile: "https://www.ashesh.org/app/news/logo/bizmandu.jpg" },
  { name: "Techpana", url: "https://techpana.com/feed", profile: "https://www.ashesh.org/app/news/logo/techpana.jpg" },
  { name: "SwasthyaKhabar", url: "https://swasthyakhabar.com/feed", profile: "https://swasthyakhabar.com/wp-content/uploads/2020/01/logo.png" },
  { name: "Nagarik News", url: "https://nagariknews.nagariknetwork.com/feed", profile: "https://staticcdn.nagariknetwork.com/images/default-image.png" },
  { name: "BBC Nepali", url: "https://www.bbc.com/nepali/index.xml", profile: "https://news.bbcimg.co.uk/nol/shared/img/bbc_news_120x60.gif" }
];

// ================= CATEGORY MAP =================
const SOURCE_CATEGORY = {
  Techpana: "प्रविधि",
  BizMandu: "अर्थ",
  SwasthyaKhabar: "स्वास्थ्य",
  "BBC Nepali": "अन्तर्राष्ट्रिय"
};

// ================= HELPERS =================
function cleanText(text = "") {
  return text.replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
}

function cleanPubDate(pubDate = "") {
  return pubDate.replace(/[\n\r\t]/g, " ").trim();
}

async function fetchArticleImage(url) {
  try {
    const { data } = await axios.get(url, { timeout: 4000 });
    const $ = cheerio.load(data);
    const og = $('meta[property="og:image"]').attr("content") || $('meta[name="twitter:image"]').attr("content");
    if (og) return og;
    return $("article img").first().attr("src") || $("img").first().attr("src") || "";
  } catch {
    return "";
  }
}

// ================= INDIVIDUAL FEED CACHE =================
let FEED_CACHE = {};
const CACHE_DURATION = 10 * 60 * 1000; // 10 min

// Fetch RSS with retry
async function fetchFeedWithRetry(feed, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const data = await parser.parseURL(feed.url);
      return data;
    } catch (err) {
      if (i === retries - 1) return null; // failed after retries
    }
  }
  return null;
}

// ================= ROUTE =================
app.get("/news", async (req, res) => {
  try {
    let requestedCategories = req.query.category;
    if (requestedCategories) {
      requestedCategories = requestedCategories.split(",").map(c => c.trim());
    }

    let articles = [];

    // Fetch each feed individually with caching
    await Promise.all(FEEDS.map(async (feed) => {
      const now = Date.now();

      if (!FEED_CACHE[feed.name] || now - FEED_CACHE[feed.name].time > CACHE_DURATION) {
        const feedData = await fetchFeedWithRetry(feed);
        if (feedData) {
          const items = feedData.items.slice(0, 6); // limit per feed
          const feedArticles = await Promise.all(items.map(async (item) => {
            let image = item.enclosure?.url || item["media:content"]?.url || "";
            if (!image && item.link) image = await fetchArticleImage(item.link);

            const category = item.categories?.[0] || SOURCE_CATEGORY[feed.name] || "समाचार";

            return {
              source: { id: null, name: feed.name },
              category,
              author: item.creator || null,
              title: cleanText(item.title),
              description: cleanText(item.contentSnippet || item.content || ""),
              url: item.link,
              urlToImage: image || null,
              publishedAt: new Date(cleanPubDate(item.pubDate)).toISOString(),
              content: cleanText(item.content || "")
            };
          }));

          FEED_CACHE[feed.name] = {
            data: feedArticles,
            time: now
          };
        } else {
          FEED_CACHE[feed.name] = {
            data: [],
            time: now
          };
        }
      }

      articles.push(...FEED_CACHE[feed.name].data);
    }));

    // Filter by category if requested
    if (requestedCategories) {
      articles = articles.filter(a => requestedCategories.includes(a.category));
    }

    // Sort by date
    articles.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

    res.json({
      status: "ok",
      totalResults: articles.length,
      articles
    });

  } catch {
    res.status(500).json({
      status: "error",
      message: "Failed to fetch news"
    });
  }
});

// ================= START =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`✅ Ultra-fast News API → http://localhost:${PORT}/news`)
);
