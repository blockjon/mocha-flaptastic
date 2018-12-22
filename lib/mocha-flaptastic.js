var Mocha = require('mocha');
var fs = require('fs');
const https = require('https');

/**
 * A simple UI that only exposes a single function: test
 */
module.exports = Mocha.interfaces['mocha-flaptastic'] = function(suite) {

    // After the listener is registered, this helps us not reregister.
    let configured = false;

    // After the listener is registered, this helps us not reregister.
    let sufficientEnvVars = null;

    var doPost = function(body) {
        let hostname = 'frontend-api.flaptastic.com'
        let path = "/api/v1/ingest"
        const data = JSON.stringify(body)
        const options = {
            hostname: hostname,
            port: 443,
            path: path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': data.length,
                'Bearer': process.env["FLAPTASTIC_API_TOKEN"]
            }
        }
        const req = https.request(options, (res) => {
            console.log(`statusCode: ${res.statusCode}`)
            if (res.statusCode != 201) {
                console.error("Failed to send test results to flaptastic. HTTP code: " + resp.statusCode)
            }
        })

        req.on('error', (error) => {
            console.error(error)
        })

        req.write(data)
        req.end()
    };

    var getMissingRequiredEnvVars = function() {
        let required = [
            'FLAPTASTIC_ORGANIZATION_ID',
            'FLAPTASTIC_API_TOKEN',
            'FLAPTASTIC_BRANCH',
            'FLAPTASTIC_SERVICE'
        ];
        var missing = [];
        for (let i = 0; i < required.length; i++) {
            if (process.env[required[i]] == null) {
                missing.push(required[i])
            }
        }
        return missing;
    };

    var getExceptionSite = function(file, line) {
        var exceptionSite = [];
        var contents = fs.readFileSync(file, 'utf8');
        let fileArray = contents.split("\n")
        for (var i=0; i<fileArray.length; i++) {
            if ((i > line - 5) && (i <= line)) {
                exceptionSite.push({
                    line_number: i+1,
                    line: fileArray[i]
                })
            }
        }
        return exceptionSite;
    };

    var deliverFlaps = function(buffer) {
        if (sufficientEnvVars === null) {
            let missingEnvVars = getMissingRequiredEnvVars();
            if (missingEnvVars.length === 0) {
                sufficientEnvVars = true;
                console.log("Flaptastic plugin activated.")
            } else {
                console.error("Flaptastic will not run due to missing env variables: " + missingEnvVars);
                sufficientEnvVars = false;
                return;
            }
        }
        doc = {
            "branch": process.env["FLAPTASTIC_BRANCH"],
            "commit_id": process.env["FLAPTASTIC_COMMIT_ID"] != undefined ? process.env["FLAPTASTIC_COMMIT_ID"] : '',
            "link": process.env["FLAPTASTIC_LINK"] != undefined ? process.env["FLAPTASTIC_LINK"] : '',
            "organization_id": process.env["FLAPTASTIC_ORGANIZATION_ID"] != undefined ? process.env["FLAPTASTIC_ORGANIZATION_ID"] : '',
            "service": process.env["FLAPTASTIC_SERVICE"] != undefined ? process.env["FLAPTASTIC_SERVICE"] : '',
            "timestamp": Math.floor(new Date().valueOf() / 1000),
            "test_results": buffer
        }
        doPost(doc);
    };

    suite.on('pre-require', function(context, file, mocha) {
        if (configured) {
            return;
        }

        let buffer = [];

        // console.log("pre-require detected for " + file)
        // context.beforeEach('flaptasticSkipper', function() {
        //     // this.currentTest.skip()
        //     console.log("beforeEach...")
        // });

        context.afterEach('flaptasticSkipper', function() {
            var line = 0
            var exception = null;
            var file_stack = [];
            var exception_site = [];
            if (this.currentTest.state == "failed") {
                line = parseInt(this.currentTest.err.stack.match(/:(\d+):/)[1]);
                exception = this.currentTest.err.message
                file_stack.push(this.currentTest.err.stack.match(/\((.*?):/)[1])
                exception_site = getExceptionSite(
                    this.currentTest.file,
                    line
                )
            }
            let regex = new RegExp("^" + process.cwd() + "/");
            let relativeFileName = this.currentTest.file.replace(regex, '')
            buffer.push({
                file: relativeFileName,
                line: line,
                name: this.currentTest.title,
                status: this.currentTest.state,
                exception: exception,
                package: null,
                file_stack: file_stack,
                exception_site: exception_site
            });
            if (buffer.length > 10) {
                deliverFlaps(buffer)
                buffer = [];
            }
        });

        context.after('flaptasticSkipper', function() {
            deliverFlaps(buffer)
            buffer = [];
        });

        configured = true;
    });
};
