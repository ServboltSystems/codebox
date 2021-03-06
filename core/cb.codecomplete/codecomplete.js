var Q = require('q');
var _ = require('underscore');
var path = require('path');
var utils = require('../utils');


function CodeComplete(events, workspace) {
    this.events = events;
    this.workspace = workspace;
    this.handlers = {};

    _.bindAll(this);
}

/*
 *  Add a handler for codecompletion
 *  The 'handler' function will be called with an option object
 *  and should return a list of tag with the format:
 *  {
 *      'name': "Tag name",
 *      'file': "path relative to the workspace root",
 *      'score': 1,  // It will default to 1
 *      'meta': "meta information: ex: 'class', 'function'",
 *      'content': "Description html content"
 *  }
 */
CodeComplete.prototype.addHandler = function(name, handler) {
    if (this.handlers[name]) {
        return Q.reject(new Error("Handler already exists"));
    }
    this.handlers[name] = handler;
    return Q();
}


/*
 *  Add a tags indexer for codecompletion
 *  The populate will be called when necessaray to update a tags idnex used
 *  to return codecompletion results
 */
CodeComplete.prototype.addIndex = function(name, populate, options) {
    var that = this;
    var index = null;

    options = _.defaults({}, options || {}, {
        'interval': 1*60*1000 // 1 minute
    })

    var populateIndex = function() {
        return Q(populate({
            'root': that.workspace.root
        })).then(function(items) {
            index = items;
        }, function(err) {
            index = null;
            console.log("index failed: ", err);
        });
    };

    // Populate the index when there are changes
    var throttled = _.throttle(populateIndex, options.interval);
    this.events.on("watch.change.update", throttled);
    this.events.on("watch.change.create", throttled);
    this.events.on("watch.change.delete", throttled);
    

    // Add namespace
    this.addHandler(name, function(options) {
        var prepare = Q();

        // if no ndex yet: populate the index
        if (!index) {
            prepare = populateIndex();
        }

        // Filter the index for getting the results
        return prepare.then(function() {
            // Filter is done by the 'get'
            return index;
        });
    });
}


/*
 *  Return results for completion
 *  Option can be used to filter by file, query, ...
 */
CodeComplete.prototype.get = function(options) {
    options = _.defaults({}, options || {}, {
        // Filter name with query
        'query': null,

        // Filter filepath with file
        'file': null
    });

    var results = [];

    // Get all results from all the handlers
    return Q.all(_.map(this.handlers, function(handler, name) {
        return Q(handler(options, name)).then(function(_results) {
            results = results.concat(_results);
        });
    })).then(function() {
        return _.chain(results)
        // Filter results
        .filter(function(result) {
            // Check format
            if (!result.name) return false;

            // Filter the result
            if (options.file && result.file.indexOf(options.file) != 0) return false
            if (options.query && result.name.indexOf(options.query) != 0) return false;

            return true;
        })

        // Remove doublons
        .uniq(function(result) {
            return result.name;
        })

        // Order results
        .sortBy(function(result) {
            return result.score;
        })
        .value();
    })
}

// Exports
exports.CodeComplete = CodeComplete;
