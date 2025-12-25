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
  Techpana: "प्रविधि",
  BizMandu: "अर्थ",
  SwasthyaKhabar: "स्वास्थ्य",
  "BBC Nepali": "अन्तर्राष्ट्रिय"
};

// ================= HELPERS =================
function cleanText(text = "") {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractImageFromContent(html = "") {
  const match = html.match(/<img[^>]+src="([^">]+)"/i);
  return match ? match[1] : "";
}

function fixRelativeUrl(img, pageUrl) {
  if (!img) return "";
  if (img.startsWith("http")) return img;
  if (img.startsWith("/")) {
    const u = new URL(pageUrl);
    return `${u.protocol}//${u.host}${img}`;
  }
  return img;
}

async function fetchArticleImage(url) {
  try {
    const { data } = await axios.get(url, {
      timeout: 8000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9"
      }
    });

    const $ = cheerio.load(data);

    let img =
      $('meta[property="og:image"]').attr("content") ||
      $('meta[name="twitter:image"]').attr("content") ||
      $("article img").first().attr("src") ||
      $("img").first().attr("src");

    return fixRelativeUrl(img, url);
  } catch {
    return "";
  }
}

// ================= CACHE =================
let CACHE = { data: null, time: 0 };
const CACHE_DURATION = 10 * 60 * 1000; // 10 min

// ================= ROUTE =================
app.get("/news", async (req, res) => {
  try {
    let requestedCategories = req.query.category;
    if (requestedCategories) {
      requestedCategories = requestedCategories.split(",").map(c => c.trim());
    }

    if (CACHE.data && Date.now() - CACHE.time < CACHE_DURATION) {
      let data = CACHE.data;
      if (requestedCategories) {
        data = data.filter(a => requestedCategories.includes(a.category));
      }
      return res.json({ status: "ok", totalResults: data.length, articles: data });
    }

    let articles = [];

    await Promise.all(FEEDS.map(async feed => {
      try {
        const feedData = await parser.parseURL(feed.url);
        const items = feedData.items.slice(0, 4); // limit for stability

        const feedArticles = await Promise.all(items.map(async item => {
          let image =
            item.enclosure?.url ||
            item["media:content"]?.url ||
            extractImageFromContent(item["content:encoded"]);

          if (image) image = fixRelativeUrl(image, item.link);

          if (!image && item.link) {
            image = await fetchArticleImage(item.link);
          }

          if (!image) {
            image = "https://via.placeholder.com/800x450?text=News";
          }

          const category =
            item.categories?.[0] ||
            SOURCE_CATEGORY[feed.name] ||
            "समाचार";

          return {
            source: { id: null, name: feed.name },
            category,
            author: item.creator || null,
            title: cleanText(item.title),
            description: cleanText(item.contentSnippet || item.content || ""),
            url: item.link,
            urlToImage: image,
            publishedAt: new Date(item.pubDate || Date.now()).toISOString(),
            content: cleanText(item.content || "")
          };
        }));

        articles.push(...feedArticles);
      } catch {
        console.log(`❌ Failed: ${feed.name}`);
      }
    }));

    articles.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

    CACHE = { data: articles, time: Date.now() };

    if (requestedCategories) {
      articles = articles.filter(a => requestedCategories.includes(a.category));
    }

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
