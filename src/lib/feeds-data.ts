export const BUILTIN_FEEDS = [
  // 国际
  { name: 'BBC News', url: 'http://feeds.bbci.co.uk/news/rss.xml', topic: '国际' },
  { name: 'Reuters Top News', url: 'https://feeds.reuters.com/reuters/topNews', topic: '国际' },
  { name: 'AP News', url: 'https://rsshub.app/apnews/topics/apf-topnews', topic: '国际' },
  { name: 'The Guardian World', url: 'https://www.theguardian.com/world/rss', topic: '国际' },
  { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', topic: '国际' },
  { name: 'DW News', url: 'https://rss.dw.com/rdf/rss-en-all', topic: '国际' },

  // 科技
  { name: 'Hacker News', url: 'https://hnrss.org/frontpage', topic: '科技' },
  { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', topic: '科技' },
  { name: 'TechCrunch', url: 'https://techcrunch.com/feed/', topic: '科技' },
  { name: 'Ars Technica', url: 'http://feeds.arstechnica.com/arstechnica/index', topic: '科技' },
  { name: 'Wired', url: 'https://www.wired.com/feed/rss', topic: '科技' },

  // 财经
  { name: 'Financial Times', url: 'https://www.ft.com/?format=rss', topic: '财经' },
  { name: 'Bloomberg Markets', url: 'https://feeds.bloomberg.com/markets/news.rss', topic: '财经' },
  { name: 'The Economist', url: 'https://www.economist.com/rss.xml', topic: '财经' },

  // 科学
  { name: 'NASA', url: 'https://www.nasa.gov/rss/dyn/breaking_news.rss', topic: '科学' },
  { name: 'Nature News', url: 'https://www.nature.com/nature.rss', topic: '科学' },
  { name: 'New Scientist', url: 'https://www.newscientist.com/feed/home/', topic: '科学' },
]

export const DEFAULT_TOPICS = ['国际', '科技', '财经', '科学']
