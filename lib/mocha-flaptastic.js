var Mocha = require('mocha');
Suite = require('mocha/lib/suite');

let exampleHook = function() {
    console.log("YAY");
};

console.log("mocha-flaptastic.js is loaded!")

// Somehow register this as a hook here.
