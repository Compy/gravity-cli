#!/usr/bin/env node
const fs = require('fs');
const colors = require('colors');
const version = require('./package').version;
const http = require('follow-redirects').https;
const tar = require('tar');
const tmp = require('tmp');
const os = require('os');
const readline = require('readline');
const url = require('url');
const Q = require('q');

var args = process.argv.splice(process.execArgv.length + 2);
let config = false;
let configPath = os.homedir() + '/.config/gravity.json';
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function showHelp() {
  console.log('Gravity Installer'.blue + ' Version: ' + version);
  console.log('');
  console.log('Usage:'.cyan);
  console.log('    new <application name>');
  console.log('        Creates a new Gravity application inside the given folder with the given name.');
}

function exit(exitCode) {
  rl.close();
  process.exit(exitCode);
}

function getLicenseInfo(callback) {
  console.log('Gravity requires a license key in order to take advantage of premium features.')
  rl.question('License key: '.cyan, function (answer) {
    config.licenseKey = answer;
    fs.writeFileSync(configPath, JSON.stringify(config));
    callback();
  });
}

function downloadTest(uri, filename) {
  var urlInfo = url.parse(uri);
  var protocol = url.parse(uri).protocol.slice(0, -1);
  var deferred = Q.defer();
  var onError = function (e) {
    fs.unlink(filename);
    deferred.reject(e);
  }
  urlInfo.headers = {
    "User-Agent": "GravityInstaller/1.0.0"
  };
  if (urlInfo.host == 'repobox.io') {
    urlInfo.headers["Authorization"] = "Bearer " + config.licenseKey;
  }
  let req = require(protocol).get(urlInfo, function (response) {
    if (response.statusCode >= 200 && response.statusCode < 300) {
      var fileStream = fs.createWriteStream(filename);
      fileStream.on('error', onError);
      fileStream.on('close', deferred.resolve);
      response.pipe(fileStream);
    } else if (response.headers.location) {
      deferred.resolve(downloadTest(response.headers.location, filename));
    } else {
      console.log(req);
      deferred.reject(new Error(response.statusCode + ' ' + response.statusMessage));
    }
  }).on('error', onError);
  return deferred.promise;
};

function processInput() {
  if (args[0] == 'new') doNew();
}

function doNew() {
  if (args.length < 2) {
    showHelp();
    exit(1);
  }
  let appName = args[1];
  if (fs.existsSync(appName)) {
    console.error('Error: '.red + ' The folder ' + appName + ' already exists');
    exit(1);
  }

  http.get('https://repobox.io/npm/@compy/gravity-lite', { trackRedirects: true }, function (res) {
    let json = '';
    res.on('data', function (chunk) {
      json += chunk;
    });
    res.on('end', function () {
      if (res.statusCode === 200) {
        try {
          let data = JSON.parse(json);
          let version = data['dist-tags']['latest'];
          console.log('Generating app with Gravity ' + version);

          let tmpDir = tmp.dirSync();
          downloadTest(data['versions'][version]['dist']['tarball'], tmpDir.name + '/package.tgz', undefined, {
            "Authorization": "Bearer " + config.licenseKey,
            "User-Agent": "GravityInstaller/1.0"
          }).catch(function (error) {
            console.error('Gravity download failed'.red);
            console.error(error.message);
            exit(1);
          }).then(function () {
            fs.mkdirSync(appName);

            tar.x({
              file: tmpDir.name + '/package.tgz',
              strip: 1,
              C: appName
            }).then(function () {
              console.log('Gravity has bootstrapped your application for you! Now go make something great.'.green);
              tmpDir.removeCallback();
              exit(0);
            }).catch(function (error) {
              console.error('Error while extracting framework tarball'.red);
              console.error(error);
              tmpDir.removeCallback();
              exit(1);
            });
          });
        } catch (e) {
          console.error('Response payload from server was invalid.'.red);
          console.error(e);
          exit(1);
        }
      } else {
        console.error('Got '.red + res.statusCode.red + ' from server: '.red + res.statusMessage.red);
        exit(1);
      }
    });
  });
}

if (args.length < 1) {
  showHelp();
  exit(1);
}

// Load config
if (!fs.existsSync(os.homedir() + '/.config')) {
  fs.mkdirSync(os.homedir() + '/.config');
}
if (!fs.existsSync(configPath)) {
  fs.writeFileSync(configPath, '{}');
}
try {
  config = JSON.parse(fs.readFileSync(configPath));
} catch (e) {
  console.error('Could not parse config file at '.red + configPath.red);
  exit(1);
}

if (!!config.licenseKey) {
  processInput();
} else {
  getLicenseInfo(processInput);
}