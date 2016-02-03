// Native Node JS Modules
var fs          = require('fs');
var http        = require('http');
var querystring = require('querystring');
var url         = require('url');
var util        = require('util');

// Third party libraries 
var async;
var request;
var _;

// Check that the required modules are installed. For teaching purposes only. Don't do this 
// in proudction.
try {
  request = require('request')
} catch (e) {
  console.log('You didn\'t install request. Run \n\nnpm install request\n\nto fix the problem.');
  process.exit(1);
}

try {
  async = require('async')
} catch (e) {
  console.log('You didn\'t install async. Run \n\nnpm install async\n\nto fix the problem.');
  process.exit(1);
}

try {
  _ = require('underscore')
} catch (e) {
  console.log('You didn\'t install underscore. Run \n\nnpm install underscore\n\nto fix the problem.');
  process.exit(1);
}

// HTML page we will serve up
var htmlPage = fs.readFileSync('./index.html');

// PORT to listen on 
const PORT=8080;

// This function is the core of our 'server'
function handleRequest(request, response) {
  var urlJsonObject = url.parse(request.url);
  var pathname      = urlJsonObject.pathname;
  var urlQuery      = urlJsonObject.query;
  var queryObject   = querystring.parse(urlQuery);

  // HOME page
  if (pathname === '/') {
    response.end(htmlPage)
  }

  // ajax route
  else if (pathname === '/ajax'){
    getJsonData(queryObject.query, function (err, result) {
      if (err) {
        response.statusCode = 500;
        response.end();
        return;
      }
      response.writeHead(200, {"Content-Type": "application/json"});
      response.end(JSON.stringify({amazonItems: result}));
    });
  }

  // no such route
  else {
    response.statusCode = 404;
    response.end('Page not found');
  }
}

function getJsonData(keywords, callback) {
  // replace single or multiple spaces with a single +
  // " this   is a   query    " -> "this+is+a+query"
  var strippedKeywords = keywords.replace(/\s+/g, '+').trim();

  // url encode "this+is+a+query" -> "this%2Bis%2Ba&2Bquery"
  var urlEncodedKeywords = encodeURIComponent(strippedKeywords);

  // documentation on async.parallel here: https://github.com/caolan/async#parallel
  // variable result will be an object with the scrapped data like so:
  // { 
  //   title: [title1, title2, ...],
  //   price: [price1, price2, ...],
  //   images: [url1, url2, ...]
  // }
  async.parallel({
    title: function(cb) {
      getTitlesFromAPI(urlEncodedKeywords, cb);
    },
    price: function(cb) {
      getPricesFromAPI(urlEncodedKeywords, cb);
    },
    images: function(cb) {
      getImagesFromAPI(urlEncodedKeywords, cb);
    }
  }, function(err, result) {
    // all sub callbacks have finished
    if (err) {
      return callback(err);
    }

    // documentation here: http://underscorejs.org/#zip
    // it works like this:
    // _.zip([1, 2], [3, 4], [5, 6]) -> [[1, 3, 5], [2, 4, 6]]
    var zippedItems = _.zip(result.title, result.price, result.images);

    // convert list of lists into list of objects that will be turned into HTML by the front-end javascript
    // [[1, 3, 5], [2, 4, 6]] -> [{title: 1, price: 3, imgURL: 5}, {title: 2, price: 4, imgURL: 6}]
    var amazonObjectList = []
    _.each(zippedItems, function(item) {
      amazonObjectList.push({
        title: item[0],
        price: item[1],
        imgURL: item[2]
      });
    });
    callback(null, amazonObjectList);
  });
}

function getTitlesFromAPI(urlEncodedKeywords, callback) {
  var titleURL = "https://query.yahooapis.com/v1/public/yql?q=select%20title%20from%20html(0%2C10)%20where%20url%3D'http%3A%2F%2Fwww.amazon.com%2Fs%3Furl%3Dsearch-alias%253Daps%26field-keywords%3D" + urlEncodedKeywords + "'%20and%20compat%3D'html5'%20and%20xpath%3D%20'%2F%2Fhtml%2Fbody%2Fdiv%5B1%5D%2Fdiv%5B1%5D%2Fdiv%5B3%5D%2Fdiv%5B2%5D%2Fdiv%2Fdiv%5B4%5D%2Fdiv%5B1%5D%2Fdiv%2Ful%2Fli%2Fdiv%2Fdiv%2Fdiv%2Fdiv%5B2%5D%2Fdiv%5B1%5D%2Fa'&format=json&env=store%3A%2F%2Fdatatables.org%2Falltableswithkeys";

  // _.pluck does this: [{title: 1}, {title: 2}] -> [1, 2]
  callAPI(titleURL, function(err, result) {
    var titleList = _.pluck(result.a, 'title');
    callback(err, titleList);
  });
}

function getPricesFromAPI(urlEncodedKeywords, callback) {
  var priceURL = "https://query.yahooapis.com/v1/public/yql?q=select%20content%20from%20html(0%2C10)%20where%20url%3D'http%3A%2F%2Fwww.amazon.com%2Fs%3Furl%3Dsearch-alias%253Daps%26field-keywords%3D" + urlEncodedKeywords + "'%20and%20compat%3D%22html5%22%20and%20xpath%3D'%2Fhtml%2Fbody%2Fdiv%5B1%5D%2Fdiv%5B1%5D%2Fdiv%5B3%5D%2Fdiv%5B2%5D%2Fdiv%2Fdiv%5B4%5D%2Fdiv%5B1%5D%2Fdiv%2Ful%2Fli%2Fdiv%2Fdiv%2Fdiv%2Fdiv%5B2%5D%2Fdiv%5B2%5D%2Fdiv%5B1%5D%2Fdiv%5B1%5D%2Fa%2Fspan'&format=json&env=store%3A%2F%2Fdatatables.org%2Falltableswithkeys";

  callAPI(priceURL, function(err, result) {
    callback(err, result.span);
  });
}

function getImagesFromAPI(urlEncodedKeywords, callback) {
  var imgSrcURL = "https://query.yahooapis.com/v1/public/yql?q=select%20src%20from%20html(0%2C10)%20where%20url%3D'http%3A%2F%2Fwww.amazon.com%2Fs%3Furl%3Dsearch-alias%253Daps%26field-keywords%3D" + urlEncodedKeywords + "'%20and%20compat%3D%22html5%22%20and%20xpath%3D'%2F%2Fhtml%2Fbody%2Fdiv%5B1%5D%2Fdiv%5B1%5D%2Fdiv%5B3%5D%2Fdiv%5B2%5D%2Fdiv%2Fdiv%5B4%5D%2Fdiv%5B1%5D%2Fdiv%2Ful%2Fli%2F%2Fdiv%2Fdiv%5B1%5D%2Fdiv%2Fdiv%2Fa%2Fimg%2F%40src'&format=json&env=store%3A%2F%2Fdatatables.org%2Falltableswithkeys"

  callAPI(imgSrcURL, function(err, result) {
    var imgList = _.pluck(result.img, 'src');
    callback(err, imgList);
  });
}

// External requests handled here
function callAPI(url, callback) {
  var options = {
    url: url,
    contentType: 'json'
  }

  request.get(options, function (err, response, body) {
    if (err) {
      return callback(err)
    }
    var jsonBody;
    try {
      jsonBody = JSON.parse(body);
    }
    catch (e) {
      // json parsing failed
      return callback(e); 
    }

    var result = jsonBody.query.results;
    callback(null, result);
  });
}

// Create the server
var server = http.createServer(handleRequest);

// Start the server
server.listen(PORT, function() {
  console.log("Server listening on: http://localhost:", PORT);
});
