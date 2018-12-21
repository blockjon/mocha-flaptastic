var Mocha = require('mocha');
Suite = require('mocha/lib/suite');

let exampleHook = function() {
    console.log("YAY");
};

// Somehow register this as a hook here.
