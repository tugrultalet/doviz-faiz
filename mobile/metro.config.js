const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// The calculation code lives once, in ../public/calc.js, shared with the website.
config.watchFolders = [path.resolve(__dirname, '../public')];

module.exports = config;
