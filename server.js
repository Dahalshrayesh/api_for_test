const express = require("express");
const Parser = require("rss-parser");
const axios = require("axios");
const cheerio = require("cheerio");
const cors = require("cors");

const app = express();
const parser = new Parser({
  customFields: { item: ["media:content", "enclosure", "content:encoded"] }
});

app.use(cors());

// All Nepali news feeds with optional profile logos
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
  { name: "Ujyaalo Online", url: "https://www.ujyaaloonline.com/feed", profile: "" },
  { name: "Techpana", url: "https://techpana.com/feed", profile: "https://www.ashesh.org/app/news/logo/techpana.jpg" },
  { name: "ImageKhabar", url: "https://www.imagekhabar.com/index.xml", profile: "https://www.ashesh.org/app/news/logo/imagekhabar.jpg" },
  { name: "BBC Nepali", url: "https://www.bbc.com/nepali/index.xml", profile: "https://news.bbcimg.co.uk/nol/shared/img/bbc_news_120x60.gif" }
];

// Clean text helper
function cleanText(text = "") {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/[\n\r\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Scrape article page for image
async function fetchArticleImage(url) {
  try {
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);
    const ogImage = $('meta[property="og:image"]').attr("content");
    if (ogImage) return ogImage;
    const img = $("article img").first().attr("src");
    return img || "";
  } catch {
    return "";
  }
}

app.get("/news", async (req, res) => {
  try {
    let articles = [];

    // Loop through all feeds
    for (const feed of FEEDS) {
      try {
        const data = await parser.parseURL(feed.url);

        for (const item of data.items) {
          let image = item.enclosure?.url || item["media:content"]?.url || "";

          // If no image in RSS, scrape article page
          if (!image && item.link) {
            image = await fetchArticleImage(item.link);
          }

          articles.push({
            source: feed.name,
            title: cleanText(item.title),
            link: cleanText(item.link),
            description: cleanText(item.contentSnippet || item.content || ""),
            image: image || "",
            pubDate: cleanText(item.pubDate),
            profile: feed.profile || ""
          });
        }
      } catch (e) {
        console.error(`❌ Failed to fetch feed: ${feed.name}`);
      }
    }

    // Sort by latest first
    articles.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

    res.json({ status: "success", total: articles.length, articles });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", message: "Failed to fetch news" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Nepali News API running → http://localhost:${PORT}/news`));
