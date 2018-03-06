const request = require('request');
const jsdom = require('jsdom');
const async = require('async');
const { JSDOM } = jsdom;
const mongoClient = require('mongodb').MongoClient;

const mongoUrl = 'mongodb://polity-api:aepworneap98vbpe0a@ds155278.mlab.com:55278/polity'
const databaseName = 'polity';
const contactPages = [
  'https://www.aph.gov.au/Senators_and_Members/Parliamentarian_Search_Results?expand=1&q=&mem=1&par=-1&gen=0&ps=100&st=1',
  'https://www.aph.gov.au/Senators_and_Members/Parliamentarian_Search_Results?page=2&expand=1&q=&mem=1&par=-1&gen=0&ps=100&st=1'
];

function saveContactDetails() {
  getRepresentativeUrls()
  .then(scrapeContactDetails)
  .then((repDetails) => {
    console.log('Saving details to database...')
    db.collection('representatives').bulkWrite(repDetails.map((rep) => {
      return({
        updateOne: {
          filter: { electorate: rep.electorateName },
          update: { $set: { phone: rep.phone, address: rep.address } },
          upsert: true
        }
      });
    }), (error, res) => {
      if (error) return console.log('Error saving to database: ', error);
      console.log('Done! Successfully completed updating contact details :)');
      process.exit(1);
    });
  });
}

// Set up database & then initiate app
mongoClient.connect(mongoUrl, function (error, client) {
  if (error) return console.log(error);
  db = client.db(databaseName);
  console.log('Hello stranger. Beginning scrape of aph.gov.au for representative contact details.')
  saveContactDetails();
});

/* === SCRAPING REPRESENTATIVE CONTACT DETAILS === */

function getRepresentativeUrls() {
  console.log('Pulling down all contact page URLs of representatives.')
  const repUrls = []
  return new Promise((resolve, reject) => {
    async.each(contactPages, (pageUrl, callback) => {
      request(pageUrl, (error, response, body) => {
        const dom = new JSDOM(body, { includeNodeLocations: true });
        const document = dom.window.document;
        const repAnchorTags = document.querySelectorAll('.search-filter-results h4.title a');
        repAnchorTags.forEach(a => repUrls.push('https://www.aph.gov.au' + a.href));
        callback(error);
      });
    }, (error) => {
      if (error) return console.log('Error getting representative urls.');
      resolve(repUrls);
    });
  });
}

function scrapeContactDetails(repUrls) {
  console.log('Scraping each representative contact page for phone and address.')
  const reps = [];
  return new Promise((resolve, reject) => {
    async.each(repUrls, (url, callback) => {
      request(url, (error, response, body) => {
        const dom = new JSDOM(body);
        const document = dom.window.document;

        const electorateName = document.querySelector('h3').innerHTML.trim().split(',')[0].slice(11);
        const address = [...document.querySelectorAll('h3')]
          .filter(elem => elem.innerHTML.includes('Electorate Office'))[0]
          .nextElementSibling.nextElementSibling.innerHTML.split('<br>')
          .map(line => line.trim()).join(', ');
        const phone = [...document.querySelectorAll('dt')]
          .filter(elem => elem.innerHTML.includes('Telephone:'))[0]
          .nextElementSibling.innerHTML.split('or')[0];

        reps.push({
          electorateName,
          address,
          phone
        });
        callback(error);
      });
    }, (error) => {
      resolve(reps);
    });
  });
}
