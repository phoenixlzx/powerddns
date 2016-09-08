#!/bin/env node

'use strict';

var restify = require('restify');
var yaml = require('js-yaml');
var request = require('request');
var tld = require('tldjs');
var fs = require('fs');

try {
    var config = yaml.safeLoad(fs.readFileSync('./config.yml', 'utf8'));
} catch (e) {
    console.log(e);
    process.exit(1);
}

var server = restify.createServer();
server.use(restify.queryParser());

server.get('/api/v1/update', update);

server.listen(9001, function() {
    console.log('PowerDDNS API listening at %s',  server.url);
});

function update(req, res) {

    var zone = (req.query.zone + '').toLowerCase(),
        name = (req.query.name + '').toLowerCase(),
        type = (req.query.type + '').toUpperCase(),
        ttl = parseInt(req.query.ttl + ''),
        data = (req.query.data + '').toLowerCase(),
        nat = req.query.nat,
        key = req.query.key + '';

    if (!config.zone_key || config.zone_key[zone] !== key ) return fail(res);
    if (zone !== tld.getDomain(name)) return fail(res);
    if (config.allowed_type.indexOf(type) === -1) return fail(res);
    if (ttl < config.min_ttl) return fail(res);

    var rr = {
        name: name,
        type: type,
        ttl: ttl,
        changetype: "REPLACE",
        records: [
            {
                content: data,
                disabled: false
            }
        ]
    };

    if (type === 'A' || type === 'AAAA') {
        rr.name = name + '.';
    }

    if (nat) {
        rr.records[0].content = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    }

    request({
        method: 'PATCH',
        url: config.pdns_api_uri + '/api/v1/servers/localhost/zones/' + zone + '.',
        headers: {
            'User-Agent': 'powerddns-api',
            'X-API-Key': config.pdns_api_key
        },
        json: true,
        body: {
            rrsets: [ rr ]
        }
    }, function(error, response, body) {
        if (!error && response.statusCode === 204) {
            res.send(200, {
                status: 'OK',
                message: 'Command Executed'
            });
        } else {
            res.send(500, {
                status: 'ERROR',
                message: body
            });
        }
    });
}

function fail(res) {
    res.send(400, {
        status: 'ERROR',
        message: 'Bad Request'
    });
}
