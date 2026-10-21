const company = (id, organization, metals, urls, options = {}) => ({
  id, organization, metals, reportMetals: metals, source_type: "official_company_news",
  endpoints: urls.map(url => ({ url, kind: "html" })), ...options,
});
const regulatory = (id, organization, metals, symbol) => company(id, organization, metals,
  ["https://www.investegate.co.uk/company/" + symbol], {
    source_type: "company_regulatory_announcement",
    articlePattern: "/announcement/rns/", articleHosts: ["www.investegate.co.uk"],
  });

export const sources = [
  company("pls", "PLS Limited", ["li"], ["https://www.pls.com/invest/asx-announcements", "https://www.pls.com/news"]),
  company("igo", "IGO Limited", ["li","ni"], ["https://www.igo.com.au/site/investor-center/ASX-Announcements"]),
  company("minres", "Mineral Resources", ["li","fe"], ["https://www.mineralresources.com.au/news/"]),
  regulatory("rio-rns", "Rio Tinto", ["cu","li","al","fe"], "RIO"),
  company("vale", "Vale", ["cu","ni","fe"], ["https://vale.com/en/vale-now"], {articlePattern:"/(?:w/|en/(?:check-out|vale|emergency|q[1-4]))"}),
  regulatory("glencore-rns", "Glencore", ["cu","ni","zn","pb"], "GLEN"),
  company("eramet", "Eramet", ["ni","li"], ["https://www.eramet.com/en/news/"]),
  regulatory("bhp-rns", "BHP", ["cu","ni","fe"], "BHP"),
  company("hydro", "Norsk Hydro", ["al"], ["https://www.hydro.com/en/global/media/news/"], {articlePattern:"/news/20"}),
  regulatory("south32-rns", "South32", ["al","cu","zn","pb"], "S32"),
  company("ivanhoe", "Ivanhoe Mines", ["cu","zn"], ["https://www.ivanhoemines.com/"], {endpoints:[{url:"https://www.ivanhoemines.com/feed/",kind:"rss"},{url:"https://www.ivanhoemines.com/",kind:"html"}]}),
  company("fcx", "Freeport-McMoRan", ["cu"], ["https://investors.fcx.com/investors/news-releases/"]),
  company("antofagasta", "Antofagasta plc", ["cu"], ["https://www.antofagasta.co.uk/investors/news/"], {articlePattern:"/investors/news/20"}),
  company("mmg", "MMG Limited", ["cu","zn","pb"], ["https://www.mmg.com/investors/news-centre/","https://www.mmg.com/investors/"]),
  company("alphamin", "Alphamin Resources", ["sn"], ["https://www.alphaminresources.com/announcements/"], {
    endpoints:[{url:"https://www.alphaminresources.com/feed/",kind:"rss"},{url:"https://www.alphaminresources.com/announcements/",kind:"html"}],
    articlePattern:"/20[0-9]{2}/",dateInUrl:true,
  }),
  regulatory("andrada-rns", "Andrada Mining", ["sn","li"], "ATM"),
  company("metalsx", "Metals X", ["sn"], ["https://www.metalsx.com.au/asx-announcements/"]),
  company("anglo", "Anglo American", ["cu","fe","ni"], ["https://www.angloamerican.com/media/press-releases"], {articlePattern:"/media/press-releases/20"}),
  company("kumba", "Kumba Iron Ore", ["fe"], ["https://www.angloamericankumba.com/media/press-releases"], {articlePattern:"/media/press-releases/20"}),
  company("fortescue", "Fortescue", ["fe"], ["https://investors.fortescue.com/en/"]),
  company("teck", "Teck Resources", ["cu","zn"], ["https://www.teck.com/news/news-releases/"]),
];
export const mediaFeeds = [
  {id:"mining-technology",organization:"Mining Technology",endpoints:[{url:"https://www.mining-technology.com/feed/",kind:"rss"}]},
  {id:"northern-miner",organization:"The Northern Miner",endpoints:[{url:"https://www.northernminer.com/feed/",kind:"rss"}]},
  {id:"international-mining",organization:"International Mining",endpoints:[{url:"https://im-mining.com/feed/",kind:"rss"}]},
  {id:"ita",organization:"International Tin Association",metals:["sn"],source_type:"industry_association_news",
    endpoints:[{url:"https://www.internationaltin.org/feed/",kind:"rss"},{url:"https://www.internationaltin.org/news/",kind:"html"}]},
  {id:"australian-mining",organization:"Australian Mining",endpoints:[{url:"https://www.australianmining.com.au/feed/",kind:"rss"}]},
  {id:"mining-com",organization:"MINING.COM",endpoints:[{url:"https://www.mining.com/feed/",kind:"rss"}]},
];
export const paiPaiEventsUrl = "https://xinyuzhao526-arch.github.io/PaiPaiMetals/data/events.json";
