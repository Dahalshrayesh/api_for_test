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

  // 🔥 Business / Tech
  { name: "BizMandu", url: "https://bizmandu.com/feed", profile: "https://www.ashesh.org/app/news/logo/bizmandu.jpg" },
  { name: "Techpana", url: "https://techpana.com/feed", profile: "https://www.ashesh.org/app/news/logo/techpana.jpg" },

  // 🔥 NEW FEEDS
  {
    name: "Artha Dabali",
    url: "https://www.arthadabali.com/feed",
    profile: "https://www.arthadabali.com/wp-content/uploads/2020/01/logo.png"
  },
  {
    name: "Makalu Khabar",
    url: "https://www.makalukhabar.com/feed",
    profile: "https://www.makalukhabar.com/wp-content/uploads/2021/03/logo.png"
  },

  // Health / National / International
  {
    name: "SwasthyaKhabar",
    url: "https://swasthyakhabar.com/feed",
    profile: "https://swasthyakhabar.com/wp-content/uploads/2020/01/logo.png"
  },
  {
    name: "Nagarik News",
    url: "https://nagariknews.nagariknetwork.com/feed",
    profile: "https://staticcdn.nagariknetwork.com/images/default-image.png"
  },
  {
    name: "BBC Nepali",
    url: "https://www.bbc.com/nepali/index.xml",
    profile: "https://news.bbcimg.co.uk/nol/shared/img/bbc_news_120x60.gif"
  }
];



// ================= CATEGORY MAP =================
const SOURCE_CATEGORY = {
  Techpana: "प्रविधि",
  BizMandu: "अर्थ",
  SwasthyaKhabar: "स्वास्थ्य",
  "BBC Nepali": "अन्तर्राष्ट्रिय"  // quotes needed because of space
};

// ================= HELPERS =================
function cleanText(text = "") {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Clean pubDate
function cleanPubDate(pubDate = "") {
  return pubDate.replace(/[\n\r\t]/g, " ").trim();
}

// SCRAPE IMAGE (FAST + SAFE)
async function fetchArticleImage(url) {
  try {
    const { data } = await axios.get(url, { timeout: 4000 });
    const $ = cheerio.load(data);

    // 1️⃣ OpenGraph (best)
    const og =
      $('meta[property="og:image"]').attr("content") ||
      $('meta[name="twitter:image"]').attr("content");

    if (og) return og;

    // 2️⃣ Article image
    const img =
      $("article img").first().attr("src") ||
      $("img").first().attr("src");

    return img || "";
  } catch {
    return "";
  }
}

// ================= CACHE =================
let CACHE = {
  data: null,
  time: 0
};

const CACHE_DURATION = 10 * 60 * 1000; // 10 min

// ================= ROUTE =================
app.get("/news", async (req, res) => {
  try {
    // ⚡ Serve cache
    if (CACHE.data && Date.now() - CACHE.time < CACHE_DURATION) {
      return res.json({
        status: "success",
        cached: true,
        total: CACHE.data.length,
        articles: CACHE.data
      });
    }

    let articles = [];

    await Promise.all(
      FEEDS.map(async (feed) => {
        try {
          const feedData = await parser.parseURL(feed.url);
          const items = feedData.items.slice(0, 20); // LIMIT

          const feedArticles = await Promise.all(
            items.map(async (item) => {
              let image =
                item.enclosure?.url ||
                item["media:content"]?.url ||
                "";

              // 🔥 SCRAPE IF IMAGE MISSING (ALL SOURCES)
              if (!image && item.link) {
                image = await fetchArticleImage(item.link);
              }

              return {
                source: feed.name,
                category:
                  item.categories?.[0] ||
                  SOURCE_CATEGORY[feed.name] ||
                  "समाचार",
                title: cleanText(item.title),
                link: item.link,
                description: cleanText(item.contentSnippet || item.content || ""),
                image: image || "",
                pubDate: cleanPubDate(item.pubDate),
                profile: feed.profile
              };
            })
          );

          articles.push(...feedArticles);
        } catch {
          console.log(`❌ Failed: ${feed.name}`);
        }
      })
    );

    // SORT by pubDate
    articles.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

    CACHE.data = articles;
    CACHE.time = Date.now();

    res.json({
      status: "success",
      cached: false,
      total: articles.length,
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
