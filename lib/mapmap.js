(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.mapmap = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/*! datadata.js © 2014-2015 Florian Ledermann 

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

'use strict';

// test whether in a browser environment
if (typeof window === 'undefined') {
    // node
    var d3dsv = require('d3-dsv');
    var fs = require('fs');
    
    var fileparser = function(func) {
        return function(path, row, callback) {
            if (dd.isUndefined(callback)) {
                callback = row;
                row = null;
            }
            fs.readFile(path, 'utf8', function(error, data) {
                if (error) return callback(error);
                data = func(data, row);
                callback(null,data);
            });
        };
    };
    
    var d3 = {
        csv: fileparser(d3dsv.csv.parse),
        tsv: fileparser(d3dsv.tsv.parse),
        json: fileparser(JSON.parse)
    };

} else {
    // browser
    // we expect global d3 to be available
    var d3 = window.d3;
}


function rowFileHandler(loader) {
    // TODO: file handler API should not need to be passed map, reduce functions but be wrapped externally
    return function(path, map, reduce, options) {
    
        options = dd.merge({
            // default accessor function tries to convert number-like strings to numbers
            accessor: function(d) {
                var keys = Object.keys(d);
                for (var i=0; i<keys.length; i++) {
                    var key = keys[i],
                        val = d[key];
                    // CSV doesn't support specification of null values
                    // interpret empty field values as missing
                    if (val === "") {
                        d[key] = null;
                    }
                    else if (dd.isNumeric(val)) {
                        // unary + converts both ints and floats correctly
                        d[key] = +val;
                    }
                }
                return d;
            }
        }, options);
        
        return new Promise(function(resolve, reject) {
            loader(path, options.accessor,
                function(error, data) {
                    if (error) {
                        reject(error);
                        return;
                    }
                    resolve(dd.mapreduce(data, map, reduce));                    
                }
            );
        }); 
    };
}

function jsonFileHandler(path, map, reduce) {
    return new Promise(function(resolve, reject) {
        d3.json(path, function(error, data) {
            if (error) {
                reject(error);
                return;
            }
                                
            if (dd.isArray(data)) {
                resolve(dd.mapreduce(data, map, reduce));
            }
            else {
                // object - treat entries as keys by default
                var keys = Object.keys(data);
                var map_func;
                if (!map) {
                    // use keys as data to emit key/data pairs in map step!
                    map_func = dd.map.dict(data);
                }
                else {
                    map_func = function(k, emit) {
                        // put original key into object
                        var v = data[k];
                        v.__key__ = k;
                        // call user-provided map funtion with object
                        map(v, emit);
                    };
                }
                resolve(dd.mapreduce(keys, map_func, reduce));
            }                    
        });
    });
}

var fileHandlers = {
    'csv':  rowFileHandler(d3.csv),
    'tsv':  rowFileHandler(d3.tsv),
    'json': jsonFileHandler
};

var getFileHandler = function(pathOrExt) {
    // guess type
    var ext = pathOrExt.split('.').pop().toLowerCase();
    return fileHandlers[ext] || null;
};

var registerFileHandler = function(ext, handler) {
    fileHandlers[ext] = handler;
};

// TODO: register .topojson, .geojson in mapmap.js

/**
Datadata - a module for loading and processing data.
You can call the module as a function to create a promise for data from a URL, Function or Array. 
Returns a promise for data for everything.
@param {(string|function|Array)} spec - A String (URL), Function or Array of data.
@param {(function|string)} [map={@link datadata.map.dict}]  - The map function for map/reduce.
@param {(string)} [reduce=datadata.emit.last] - The reduce function for map/reduce.
@exports module:datadata
*/
var dd = function(spec, map, reduce, options) {

    // options
    // type: override file extension, e.g. for API urls (e.g. 'csv')
    // fileHandler: manually specify file handler to be used to load & parse file
    options = options || {};

    if (spec == null) throw new Error("datadata.js: No data specification.");
        
    if (map && !dd.isFunction(map)) {
        // map is string -> map to attribute value
        map = dd.map.key(map);
    }
    
    if (dd.isString(spec)) {
        // consider spec to be a URL/file to load
        var handler = options.fileHandler || getFileHandler(options.type || spec);
        if (handler) {
            return handler(spec, map, reduce, options);
        }
        else {
            throw new Error("datadata.js: Unknown file type for: " + spec);
        }
    }
    if (dd.isArray(spec)) {
        return new Promise(function(resolve, reject) {
            resolve(dd.mapreduce(spec, map, reduce));
        });
    }
    throw new Error("datadata.js: Unknown data specification.");
};

// expose registration method & rowFileHandler helper
dd.registerFileHandler = registerFileHandler;
dd.rowFileHandler = rowFileHandler;

// simple load function, returns a promise for data without map/reduce-ing
// DO NOT USE - present only for mapmap.js legacy reasons
dd.load = function(spec, key) {
    if (spec.then && typeof spec.then === 'function') {
        // already a thenable / promise
        return spec;
    }
    else if (dd.isString(spec)) {
        // consider spec to be a URL to load
        // guess type
        var ext = spec.split('.').pop();
        if (ext == 'json' || ext == 'topojson' || ext == 'geojson') {
            return new Promise(function(resolve, reject) {
                d3.json(spec, function(error, data) {
                    if (error) {
                        reject(error);
                        return;
                    }
                    resolve(data);
                });
            });
        }
        else {
            console.warn("Unknown extension: " + ext);
        }
    }
};


// Type checking
/**
Return true if argument is a string.
@param {any} val - The value to check.
*/
dd.isString = function (val) {
  return Object.prototype.toString.call(val) == '[object String]';
};
/**
Return true if argument is a function.
@param {any} val - The value to check.
*/
dd.isFunction = function(obj) {
    return (typeof obj === 'function');
};
/**
Return true if argument is an Array.
@param {any} val - The value to check.
*/
dd.isArray = function(obj) {
    return (obj instanceof Array);
};
/**
Return true if argument is an Object, but not an Array, String or anything created with a custom constructor.
@param {any} val - The value to check.
*/
dd.isDictionary = function(obj) {
    return (obj && obj.constructor && obj.constructor === Object);
};
/**
Return true if argument is undefined.
@param {any} val - The value to check.
*/
dd.isUndefined = function(obj) {
    return (typeof obj == 'undefined');
};
/**
Return true if argument is a number or a string that strictly looks like a number.
This method is stricter than +val or parseInt(val) as it doesn't validate the empty
string or strings contining any non-numeric characters. 
@param {any} val - The value to check.
*/
dd.isNumeric = function(val) {
    // check if string looks like a number
    // +"" => 0
    // parseInt("") => NaN
    // parseInt("123OK") => 123
    // +"123OK" => NaN
    // so we need to pass both to be strict
    return !isNaN(+val) && !isNaN(parseFloat(val));
}

// Type conversion / utilities
/**
If the argument is already an Array, return a copy of the Array.
Else, return a single-element Array containing the argument.
*/
dd.toArray = function(val) {
    if (!val) return [];
    // return a copy if aready array, else single-element array
    return dd.isArray(val) ? val.slice() : [val];
};

/**
Shallow object merging, mainly for options. Returns a new object.
*/
dd.merge = function() {
    var obj = {};

    for (var i = 0; i < arguments.length; i++) {
        var src = arguments[i];
        
        for (var key in src) {
            if (src.hasOwnProperty(key)) {
                obj[key] = src[key];
            }
        }
    }

    return obj;
};

/**
Return an {@link module:datadata.OrderedHash|OrderedHash} object.
@exports module:datadata.OrderedHash
*/
dd.OrderedHash = function() {
    // ordered hash implementation
    var keys = [];
    var vals = {};
    
    return {
        /**
        Add a key/value pair to the end of the OrderedHash.
        @param {String} k - Key
        @param v - Value
        */
        push: function(k,v) {
            if (!vals[k]) keys.push(k);
            vals[k] = v;
        },
        /**
        Insert a key/value pair at the specified position.
        @param {Number} i - Index to insert value at
        @param {String} k - Key
        @param v - Value
        */
        insert: function(i,k,v) {
            if (!vals[k]) {
                keys.splice(i,0,k);
                vals[k] = v;
            }
        },
        /**
        Return the value for specified key.
        @param {String} k - Key
        */
        get: function(k) {
            // string -> key
            return vals[k];
        },
        /**
        Return the value at specified index position.
        @param {String} i - Index
        */
        at: function(i) {
            // number -> nth object
            return vals[keys[i]];
        },
        length: function(){return keys.length;},
        keys: function(){return keys;},
        key: function(i) {return keys[i];},
        values: function() {
            return keys.map(function(key){return vals[key];});
        },
        map: function(func) {
            return keys.map(function(k){return func(k, vals[k]);});
        },
        unsorted_dict: function() {
            return vals;
        }
    };
};

// Utility functions for map/reduce
dd.map = {
    key: function(attr, remap) {
        return function(d, emit) {
            var key = d[attr];
            if (remap && remap[key] !== undefined) {
                key = remap[key];
            }
            emit(key, d);
        };
    },
    dict: function(dict) {
        return function(d, emit) {
            emit(d, dict[d]);
        };
    }
};
dd.emit = {
    ident: function() {
        return function(key, values, emit) {
            emit(key, values);
        };
    },
    first: function() {
        return function(key, values, emit) {
            emit(key, values[0]);
        };
    },
    last: function() {
        return function(key, values, emit) {
            emit(key, values[values.length - 1]);
        };
    },
    merge: function() {
        return function(key, values, emit) {
            var obj = values.reduce(function(prev, curr) {
                var keys = Object.keys(curr);
                for (var i=0; i<keys.length; i++) {
                    var k = keys[i];
                    prev[k] = curr[k];
                }
                return prev;
            });
            
            emit(key, obj);
        };
    },
    toAttr: function(attr, func) {
        func = func || dd.emit.last();
        return function(key, values, emit) {
            func(key, values, function(k, v) {
                var obj = {};
                obj[attr] = v;
                emit(k, obj);
            });
        };
    },
    sum: function(include, exclude) {
        include = wildcards(include || '*');
        exclude = wildcards(exclude);       

        return function(key, values, emit) {
            var obj = values.reduce(function(prev, curr) {
                var keys = Object.keys(curr);
                for (var i=0; i<keys.length; i++) {
                    var key = keys[i],
                        doAdd = false,
                        j;
                    
                    for (j=0; j<include.length; j++) {
                        if (key.search(include[i]) > -1) {
                            doAdd = true;
                            break;
                        }
                    }
                    for (j=0; j<exclude.length; j++) {
                        if (key.search(include[j]) > -1) {
                            doAdd = false;
                            break;
                        }
                    }
                    if (doAdd && prev[key] && curr[key] && !isNaN(prev[key]) && !isNaN(curr[key])) {
                        prev[key] = prev[key] + curr[key];
                    }
                    else {
                        prev[key] = curr[key];
                        if (doAdd) {
                            console.warn("datadata.emit.sum(): Cannot add keys " + key + "!");
                        }
                    }
                }
                return prev;
            });
            
            emit(key, obj);
        };
    }
};

dd.map.geo = {
    point: function(latProp, lonProp, keyProp) {
        var id = 0;
        return function(d, emit) {
            var key = keyProp ? d[keyProp] : id++;
            emit(key, dd.geo.Point(d[lonProp], d[latProp], d));
        };
    }
};

dd.emit.geo = {
    segments: function() {
        return function(key, data, emit) {
            var prev = null, cur = null;
            for (var i=0; i<data.length; i++) {
                cur = data[i];
                if (prev) {
                    emit(key + '-' + i, dd.geo.LineString([[prev.lon,prev.lat],[cur.lon,cur.lat]], prev));
                }
                prev = cur;
            }
        };
    }
};

// constructors for GeoJSON objects
dd.geo = {
    Point: function(lon, lat, properties) {
        return {
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [lon, lat]
            },
            properties: properties
        };
    },
    LineString: function(coordinates, properties) {
        return {
            type: 'Feature',
            geometry: {
                type: 'LineString',
                coordinates: coordinates
            },
            properties: properties
        };
    }
};

function wildcards(spec) {
    spec = dd.toArray(spec);
    for (var i=0; i<spec.length; i++) {
        if (!(spec[i] instanceof RegExp)) {
            spec[i] = new RegExp('^' + spec[i].replace('*','.*').replace('?','.'));
        }
    }
    return spec;
}

// https://code.google.com/p/mapreduce-js/
// Mozilla Public License
dd.mapreduce = function (data, map, reduce) {
	var mapResult = [],
        reduceResult = dd.OrderedHash(),
        reduceKey;
	
    reduce = reduce || dd.emit.last(); // default
    
	var mapEmit = function(key, value) {
        if (key == null) return; // do not emit if key is null or undefined
		if(!mapResult[key]) {
			mapResult[key] = [];
		}
		mapResult[key].push(value);
	};
	
	var reduceEmit = function(key, value) {
		reduceResult.push(key, value);
	};
	
	for(var i = 0; i < data.length; i++) {
		map(data[i], mapEmit);
	}
	
	for(reduceKey in mapResult) {
		reduce(reduceKey, mapResult[reduceKey], reduceEmit);
	}
	
	return reduceResult;
};

dd.mapreducer = function(map, reduce) {
    return function(data) {
        dd.mapreduce(data, map, reduce);
    };
};
// Helper functions for map etc.

// put 'd' in another object using the attribute 'key'
// optional 'pull' is the name of a key to leave on the top level 
dd.envelope = function(key, pull, func) {
    return function(d) {
        if (pull && typeof pull == 'function') {
            // envelope(key, func) case
            func = pull;
            pull = null;
        }
        if (func) d = func(d);
        var val = {};
        val[key] = d;
        if (pull) {
            val[pull] = d[pull];
            delete d[pull];
        }
        return val;
    };
};
dd.prefix = function(prefix, func) {
    return function(d) {
    
        if (func) d = func(d);
    
        var val = {},
            keys = Object.keys(d);
            
        for (var i=0; i<keys.length; i++) {
            val[prefix + keys[i]] = d[keys[i]];
        }
            
        return val;
    };
};
dd.prefix_attr = function(attr, func) {
    return function(d) {
    
        if (func) d = func(d);
    
        var val = {},
            keys = Object.keys(d),
            prefix = d[attr] ? d[attr] + '_' : '';
            
        for (var i=0; i<keys.length; i++) {
            val[prefix + keys[i]] = d[keys[i]];
        }
            
        return val;
    };
};
dd.map_attr = function(map, func) {
    return function(d) {
    
        if (func) d = func(d);
    
        if (typeof map == 'function') {
            d = map(d);
        }
        else {
            var keys = Object.keys(map);
            for (var i=0; i<keys.length; i++) {
                var key = keys[i];
                var val = map[key];
                if (typeof val == 'function') {
                    d[key] = val(d);
                }
                else if (d[val]) {
                    d[key] = d[val];
                    delete d[val];
                }
            }
        }
            
        return d;
    };
};
dd.reverse = function(data) {
    if (data.slice && typeof data.slice == 'function') {
        // slice() = copy
        return data.slice().reverse(); 
    }
    return data;
};

module.exports = dd;

},{"d3-dsv":2,"fs":2}],2:[function(require,module,exports){

},{}],3:[function(require,module,exports){
/*! mapmap.js 0.2.8-dev.0 © 2014-2015 Florian Ledermann 

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

var dd = require('datadata');

var version = '0.2.8-dev.0';

function assert(test, message) { if (test) return; throw new Error("[mapmap] " + message);}
assert(window.d3, "d3.js is required!");
assert(window.Promise, "Promises not available in your browser - please add the necessary polyfill, as detailed in https://github.com/floledermann/mapmap.js#using-mapmapjs");

var default_settings = {
    locale: 'en',
    keepAspectRatio: true,
    placeholderClassName: 'placeholder',
    svgAttributes: {
        'overflow': 'hidden' // needed for IE
    },
    pathAttributes: {
        'fill': 'none',
        'stroke': '#000',
        'stroke-width': '0.2',
        'stroke-linejoin': 'bevel',
        'pointer-events': 'none'
    },
    backgroundAttributes: {
        'width': '300%',
        'height': '300%',
        'fill': 'none',
        'stroke': 'none',
        'transform': 'translate(-800,-400)',
        'pointer-events': 'all'
    },
    overlayAttributes: {
        'fill': '#ffffff',
        'fill-opacity': '0.2',
        'stroke-width': '0.8',
        'stroke': '#333',
        'pointer-events': 'none'
    },
    defaultMetadata: {
        // domain:  is determined by data analysis
        scale: 'quantize',
        colors: ["#ffffcc","#c7e9b4","#7fcdbb","#41b6c4","#2c7fb8","#253494"], // Colorbrewer YlGnBu[6] 
        undefinedValue: "", //"undefined"
        //undefinedLabel: -> from locale
        undefinedColor: 'transparent'
    }
};

var mapmap = function(element, options) {
    // ensure constructor invocation
    if (!(this instanceof mapmap)) return new mapmap(element, options);

    this.settings = {};    
    this.options(mapmap.extend({}, default_settings, options));
    
    // promises
    this._promise = {
        geometry: null,
        data: null
    };

    this.selected = null;
    
    this.layers = new dd.OrderedHash();
    //this.identify_func = identify_layer;
    this.identify_func = identify_by_properties();
    
    this.metadata_specs = [];

    // convert seletor expression to node
    element = d3.select(element).node();
 
    // defaults
    this._projection = d3.geo.mercator().scale(1);
    
    this.initEngine(element);
    this.initEvents(element);
    
    this.dispatcher = d3.dispatch('choropleth','view','click','mousedown','mouseup','mousemove');
    
    return this;    
};

// expose datadata library in case we are bundled for browser
// (browserify doesn't support mutliple global exports)
mapmap.datadata = dd;

mapmap.prototype = {
	version: version
};

mapmap.extend = function extend(){
    for(var i=1; i<arguments.length; i++)
        for(var key in arguments[i])
            if(arguments[i].hasOwnProperty(key))
                arguments[0][key] = arguments[i][key];
    return arguments[0];
}

mapmap.prototype.initEngine = function(element) {
    // SVG specific initialization, for now we have no engine switching functionality
    
    // HTML elements, stored as d3 selections    
    var mainEl = d3.select(element).classed('mapmap', true),
        mapEl = mainEl.append('g').attr('class', 'map');
    
    mainEl.attr(this.settings.svgAttributes);
    
    this._elements = {
        main: mainEl,
        map: mapEl,
        parent: d3.select(mainEl.node().parentNode),
        // child elements
        defs: mainEl.insert('defs', '.map'),
        backgroundGeometry: mapEl.append('g').attr('class', 'background-geometry'),
        background: mapEl.append('rect').attr('class', 'background').attr(this.settings.backgroundAttributes),
        shadowGroup: mapEl.append('g'),
        geometry: mapEl.append('g').attr('class', 'geometry'),
        overlay: mapEl.append('g').attr('class', 'overlays'),
        fixed: mainEl.append('g').attr('class', 'fixed'),
        legend: mainEl.append('g').attr('class', 'legend'),
        placeholder: mainEl.select('.' + this.settings.placeholderClassName)
    };
    
    // set up width/height
    this.width = null;
    this.height = null;
    
    // TODO: use options.width || options.defaultWidth etc.
    if (!this.width) {
        this.width = parseInt(mainEl.attr('width')) || 800;
    }
    if (!this.height) {
        this.height = parseInt(mainEl.attr('height')) || 400;
    }
    var viewBox = mainEl.attr('viewBox');
    if (!viewBox) {
        mainEl.attr('viewBox', '0 0 ' + this.width + ' ' + this.height);
    }
    
    this._elements.defs.append('filter')
        .attr('id', 'shadow-glow')
        .append('feGaussianBlur')
        .attr('stdDeviation', 5);

    this._elements.defs.append('filter')
        .attr('id', 'light-glow')
        .append('feGaussianBlur')
        .attr('stdDeviation', 1);
    
    this._elements.shadowEl = this._elements.shadowGroup
        .append('g')
        .attr('class', 'shadow')
        .attr('filter', 'url(#shadow-glow)');
        
    this._elements.shadowCropEl = this._elements.shadowGroup
        .append('g')
        .attr('class', 'shadow-crop');
       
    this.supports = {};
    
    // feature detection
    var el = this._elements.main.append('path').attr({
        'paint-order': 'stroke',
        'vector-effect': 'non-scaling-stroke'
    });  
    
    var val = getComputedStyle(el.node()).getPropertyValue('paint-order');
    this.supports.paintOrder = val && val.indexOf('stroke') == 0;
    
    val = getComputedStyle(el.node()).getPropertyValue('vector-effect');
    this.supports.nonScalingStroke = val && val.indexOf('non-scaling-stroke') == 0;
    this._elements.main.classed('supports-non-scaling-stroke', this.supports.nonScalingStroke);
        
    el.remove();
    
    // compatibility settings
    if (navigator.userAgent.indexOf('MSIE') !== -1 || navigator.appVersion.indexOf('Trident/') > 0) {
        this.supports.hoverDomModification = false;
    }
    else {
        this.supports.hoverDomModification = true;
    }
    
    // Firefox < 35 will report wrong BoundingClientRect (adding clipped background),
    // https://bugzilla.mozilla.org/show_bug.cgi?id=530985
    var match = /Firefox\/(\d+)/.exec(navigator.userAgent);
    if (match && parseInt(match[1]) < 35) {
        this.supports.svgGetBoundingClientRect = false;
    }
    else {
        this.supports.svgGetBoundingClientRect = true;
    }
    
    var map = this;
    // save viewport state separately, as zoom may not have exact values (due to animation interpolation)
    this.current_scale = 1;
    this.current_translate = [0,0];
    
    this.zoom = d3.behavior.zoom()
        .translate([0, 0])
        .scale(1)
        .scaleExtent([1, 8])
        .on('zoom', function () {
            map.current_scale = d3.event.scale;
            map.current_translate = d3.event.translate;
            mapEl.attr('transform', 'translate(' + d3.event.translate + ')scale(' + d3.event.scale + ')');
            if (!map.supports.nonScalingStroke) {
                //map._elements.geometry.selectAll("path").style("stroke-width", 1.5 / d3.event.scale + "px");
            }
        });

    mapEl
        //.call(this.zoom) // free mousewheel zooming
        .call(this.zoom.event);
      /*  
    var drag = d3.behavior.drag()
        .origin(function() {return {x:map.current_translate[0],y:map.current_translate[1]};})
        .on('dragstart', function() {
            d3.event.sourceEvent.stopPropagation(); 
        })
        .on('dragend', function() {
            d3.event.sourceEvent.stopPropagation(); 
        })
        .on('drag', function() {
            map.current_translate = [d3.event.x, d3.event.y];
            mapEl.attr('transform', 'translate(' + d3.event.x + ',' + d3.event.y + ')scale(' + map.current_scale + ')');
        })
    ;*/
        
    //mapEl.call(drag);
    
    
    var map = this;
    
    function constructEvent(event) {
        // TODO: maybe this should be offsetX/Y, but then we need to change
        // zoomToViewportPosition to support click-to-zoom
        var pos = [event.clientX, event.clientY]
        return {
            position: pos,
            location: map._projection.invert(pos),
            event: event
        }
    };

    mapEl.on('click', function() {
        // TODO: check if anyone is listening, else return immediately
        map.dispatcher.click.call(map, constructEvent(d3.event));
    });

    mapEl.on('mousedown', function() {
        // TODO: check if anyone is listening, else return immediately
        map.dispatcher.mousedown.call(map, constructEvent(d3.event));
    });

    mapEl.on('mouseup', function() {
        // TODO: check if anyone is listening, else return immediately
        map.dispatcher.mousedown.call(map, constructEvent(d3.event));
    });

    mapEl.on('mousemove', function() {
        // TODO: check if anyone is listening, else return immediately
        map.dispatcher.mousedown.call(map, constructEvent(d3.event));
    });

};

mapmap.prototype.initEvents = function(element) {
    var map = this;
    // keep aspect ratio on resize
    function resize() {
    
        map.bounds = map.getBoundingClientRect();
        
        if (map.settings.keepAspectRatio) {
            var width = element.getAttribute('width'),
                height = element.getAttribute('height');
            if (width && height && map.bounds.width) {
                var ratio = width / height;
                element.style.height = (map.bounds.width / ratio) + 'px';
            }
        }
    }
    
    window.onresize = resize;
    
    resize();
};

var domain = [0,1];

var layer_counter = 0;

// TODO: think about caching loaded resources (#8)
mapmap.prototype.geometry = function(spec, keyOrOptions) {

    // key is default option
    var options = dd.isString(keyOrOptions) ? {key: keyOrOptions} : keyOrOptions;

    options = dd.merge({
        key: 'id',
        setExtent: true
        // layers: taken from input or auto-generated layer name
    }, options);

    var map = this;
    
    if (dd.isFunction(spec)) {
        this._promise.geometry.then(function(topo){
            var new_topo = spec(topo);
            if (typeof new_topo.length == 'undefined') {
                new_topo = [new_topo];
            }
            new_topo.map(function(t) {
                if (typeof t.geometry.length == 'undefined') {
                    t.geometry = [t.geometry];
                }
                if (typeof t.index == 'undefined') {
                    map.layers.push(t.name, t.geometry);
                }
                else {
                    map.layers.insert(t.index, t.name, t.geometry);
                }
            });
            if (options.setExtent) {
                if (!map.selected_extent) {
                    map._extent(spec);           
                }
                map.draw();
                if (options.ondraw) options.ondraw();
            }
        });
        return this;
    }

    if (dd.isDictionary(spec)) {
        if (!options.layers) {
            options.layers = 'layer-' + layer_counter++;
        }
        
        spec = [{type:'Feature',geometry:spec}];

        map.layers.push(options.layers, spec);
        // add dummy promise, we are not loading anything
        var promise = new Promise(function(resolve, reject) {
            resolve(spec);
        });
        this.promise_data(promise);
        // set up projection first to avoid reprojecting geometry
        // TODO: setExtent options should be decoupled from drawing,
        // we need a way to defer both until drawing on last geom promise works
        if (options.setExtent) {
            if (!map.selected_extent) {
                map._extent(spec);           
            }
            map.draw();
            if (options.ondraw) options.ondraw();
        }
        return this;
    }

    if (dd.isArray(spec)) {
        // Array case
        var new_topo = dd.mapreduce(spec, options.map, options.reduce);
        if (!options.layers) {
            options.layers = 'layer-' + layer_counter++;
        }
        map.layers.push(options.layers, new_topo.values());
        // add dummy promise, we are not loading anything
        var promise = new Promise(function(resolve, reject) {
            resolve(new_topo);
        });
        this.promise_data(promise);
        // set up projection first to avoid reprojecting geometry
        if (options.setExtent) {
            if (!map.selected_extent) {
                map._extent(new_topo.values());           
            }
            // TODO: we need a smarter way of setting up projection/bounding box initially
            // if extent() was called, this should have set up bounds, else we need to do it here
            // however, extent() currently operates on the rendered <path>s generated by draw()
            // Also: draw should be called only at end of promise chain, not inbetween!
            //this._promise.geometry.then(draw);
            map.draw();
            if (options.ondraw) options.ondraw();
        }
        return this;
    }

    var promise = dd.load(spec);

    // chain to existing geometry promise
    if (this._promise.geometry) {
        var parent = this._promise.geometry;
        this._promise.geometry = new Promise(function(resolve, reject) {
            parent.then(function(_) {
                promise.then(function(data) {
                    resolve(data);
                });
            });
        });
    }
    else {
        this._promise.geometry = promise;
    }
    
    this._promise.geometry.then(function(geom) {
        if (geom.type && geom.type == 'Topology') {
            // TopoJSON
            var keys = options.layers || Object.keys(geom.objects);
            keys.map(function(k) {
                if (geom.objects[k]) {
                    var objs = topojson.feature(geom, geom.objects[k]).features;
                    map.layers.push(k, objs);
					// TODO: support functions for map as well as strings
                    if (options.key) {
                        for (var i=0; i<objs.length; i++) {
                            var obj = objs[i];
                            if (obj.properties && obj.properties[options.key]) {
                                objs[i].properties.__key__ = obj.properties[options.key];
                            }
                        }
                    }
                }
            });
        }
        else {
            // GeoJSON
            if (!options.layers) {
                options.layers = 'layer-' + layer_counter++;
            }
            if (geom.features) {
                map.layers.push(options.layers, geom.features);
            }
            else {
                map.layers.push(options.layers, [geom]);
            }
        }
        // set up projection first to avoid reprojecting geometry
        if (options.setExtent) {
            if (!map.selected_extent) {
                map._extent(geom);           
            }
        }
        // TODO: we need a smarter way of setting up projection/bounding box initially
        // if extent() was called, this should have set up bounds, else we need to do it here
        // however, extent() currently operates on the rendered <path>s generated by draw()
        //this._promise.geometry.then(draw);
        map.draw();
        if (options.ondraw) options.ondraw();
    });
    
    // put into chained data promise to make sure is loaded before later data
    // note this has to happen after merging into this._promise.geometry to make
    // sure layers are created first (e.g. for highlighting)
    this.promise_data(promise);
 
    return this;
};

var identify_by_properties = function(properties){
    // TODO: calling this without properties should use primary key as property
    // however, this is not stored in the object's properties currently
    // so there is no easy way to access it
    if (!properties) {
        properties = '__key__';
    }
    // single string case
    if (properties.substr) {
        properties = [properties];
    }
    return function(layers, name){
        name = name.toString().toLowerCase();
        // layers have priority, so iterate them first
        var lyr = layers.get(name);
        if (lyr) return lyr;
        var result = [];
        // properties are ordered by relevance, so iterate these first
        for (var k=0; k<properties.length; k++) {
            var property = properties[k];
            for (var i=0; i<layers.length(); i++) {
                var key = layers.keys()[i],
                    geoms = layers.get(key);
                for (var j=0; j<geoms.length; j++) {
                    var geom = geoms[j];
                    if (geom.properties && geom.properties[property] !== undefined && geom.properties[property].toString().toLowerCase() == name) {
                        result.push(geom);
                    }
                }
            }
        }
        return result;
    };
};

var identify_layer = function(layers, name) {
    name = name.toLowerCase();
    return layers.get(name);
};

// TODO: use all arguments to identify - can be used to provide multiple properties or functions
mapmap.prototype.identify = function(spec) {
    if (typeof spec == 'function') {
        this.identify_func = spec;
        return this;
    }
    // cast to array
    if (!spec.slice) {
        spec = [spec];
    }
    this.identify_func = identify_by_properties(spec);
    return this;
};

mapmap.prototype.searchAdapter = function(selection, propName) {
    var map = this;
    return function(query, callback) {
        map.promise_data().then(function() {
            var sel = map.getRepresentations(selection),
                results = [];
            sel = sel[0];
            for (var i=0; i<sel.length; i++) {
                var d = sel[i].__data__.properties;
                if (d[propName] && d[propName].toLowerCase().indexOf(query.toLowerCase()) == 0) {
                    results.push(sel[i].__data__);
                }
            }
            callback(results);
        });
    };
};

// TODO: this is needed for search functionality (see tools.js) - generalize and integrate
// into identify() etc.
mapmap.prototype.search = function(value, key) {
    key = key || '__key__';
    return identify_by_properties([key])(this.layers, value);
};

// return the representation (= SVG element) of a given object
mapmap.prototype.repr = function(d) {
    return d.__repr__;
};


mapmap.prototype.draw = function() {

    var groupSel = this._elements.geometry
        .selectAll('g')
        .data(this.layers.keys(), function(d,i) { return d; });
    
    var map = this;
    
    var pathGenerator = d3.geo.path().projection(this._projection);

    if (this._elements.placeholder) {
        this._elements.placeholder.remove();
        this._elements.placeholder = null;
    }
    
    groupSel.enter()
        .append('g')
        .attr('class', function(d){
            return d;
        })
        .each(function(d) {
            // d is name of topology object
            var geom = map.layers.get(d);
            var geomSel = d3.select(this)
                .selectAll('path')
                .data(geom);
                        
            geomSel
                .enter()
                .append('path')
                .attr('d', pathGenerator)
                .attr(map.settings.pathAttributes)
                .each(function(d) {
                    // link data object to its representation
                    d.__repr__ = this;
                });
        });
    
    groupSel.order();
};

mapmap.prototype.anchorFunction = function(f) {
    this.anchorF = f;
    return this;
};

mapmap.prototype.anchor = function(d) {
    if (this.anchorF) {
        return this.anchorF(d);
    }
};

mapmap.prototype.size = function() {
    // bounds are re-calculate by initEvents on every resize
    return {
        width: this.width,
        height: this.height
    };
};


mapmap.prototype.getBoundingClientRect = function() {

    var el = this._elements.main.node(),
        bounds = el.getBoundingClientRect();
    
    if (this.supports.svgGetBoundingClientRect) {
        return bounds;
    }
        
    // Fix getBoundingClientRect() for Firefox < 35
    // https://bugzilla.mozilla.org/show_bug.cgi?id=530985
    // http://stackoverflow.com/questions/23684821/calculate-size-of-svg-element-in-html-page
    var cs = getComputedStyle(el),
        parentOffset = el.parentNode.getBoundingClientRect(),
        left = parentOffset.left,
        scrollTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0,
        scrollLeft = window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft || 0
    ;
    // TODO: take into account margins etc.
    if (cs.left.indexOf('px') > -1) {
        left += parseInt(cs.left.slice(0,-2));
    }
    // this tests getBoundingClientRect() to be non-buggy
    if (bounds.left == left - scrollLeft) {
        return bounds;
    }
    // construct synthetic boundingbox from computed style
    var top = parentOffset.top,
        width = parseInt(cs.width.slice(0,-2)),
        height = parseInt(cs.height.slice(0,-2));
    return {
        left: left - scrollLeft,
        top: top - scrollTop,
        width: width,
        height: height,
        right: left + width - scrollLeft,
        bottom: top + height - scrollTop
    };
};

// TODO: disable pointer-events for not selected paths
mapmap.prototype.select = function(selection) {

    var map = this;
    
    function getName(sel) {
        return (typeof sel == 'string') ? sel : (sel.selectionName || 'function');
    }
    var oldSel = this.selected;
    if (this.selected) {
        this._elements.main.classed('selected-' + getName(this.selected), false);
    }
    this.selected = selection;
    if (this.selected) {
        this._elements.main.classed('selected-' + getName(this.selected), true);
    }
    this.promise_data().then(function(){
        if (oldSel) {
            map.getRepresentations(oldSel).classed('selected',false);
        }
        if (selection) {
            map.getRepresentations(selection).classed('selected',true);
        }
    });
    return this;
};

mapmap.prototype.highlight = function(selection) {

    var map = this;
       
    if (selection === null) {
        map._elements.shadowEl.selectAll('path').remove();
        map._elements.shadowCropEl.selectAll('path').remove();
    }
    else {
        this.promise_data().then(function(data) {      
            var obj = map.getRepresentations(selection);
            map._elements.shadowEl.selectAll('path').remove();
            map._elements.shadowCropEl.selectAll('path').remove();
            obj.each(function() {
                map._elements.shadowEl.append('path')
                    .attr({
                        d: this.attributes.d.value,
                        fill: 'rgba(0,0,0,0.5)' //'#999'
                    });
                map._elements.shadowCropEl.append('path')
                    .attr({
                        d: this.attributes.d.value,
                        fill: '#fff'
                    });
            });
        });
    }
    return this;
};

/*
Call without parameters to get current selection.
Call with null to get all topology objects.
Call with function to filter geometries.
Call with string to filter geometries/layers based on identify().
Call with geometry to convert into d3 selection.

Returns a D3 selection.
*/
mapmap.prototype.getRepresentations = function(selection) {
    if (typeof selection == 'undefined') {
        selection = this.selected;
    }
    if (selection) {
        if (typeof selection == 'function') {
            return this._elements.geometry.selectAll('path').filter(function(d,i){
                return selection(d.properties);
            });
        }
        if (selection.__data__) {
            // is a geometry generated by d3 -> return selection
            return d3.select(selection);
        }
        // TODO: this should have a nicer API
        var obj = this.identify_func(this.layers, selection);
        if (!obj) return d3.select(null);
        // layer case
        if (obj.length) {
            return d3.selectAll(obj.map(function(d){return d.__repr__;}));
        }
        // object case
        return d3.select(obj.__repr__);
    }
    return this._elements.geometry.selectAll('path');
};

// TODO: this is an ugly hack for now, until we properly keep track of current merged data!
mapmap.prototype.getData = function(key, selection) {

    var map = this;
    
    return new Promise(function(resolve, reject) {
        map._promise.data.then(function(data) {
        
            data = dd.OrderedHash();
            
            map.getRepresentations(selection)[0].forEach(function(d){
                if (typeof d.__data__.properties[key] != 'undefined') {
                    data.push(d.__data__.properties[key], d.__data__.properties);
                }
            });
            
            resolve(data);
        });
    });
};

mapmap.prototype.getOverlayContext = function() {
    return this._elements.overlay;
};

mapmap.prototype.project = function(point) {
    return this._projection(point);
};


mapmap.prototype.promise_data = function(promise) {
    // chain a new promise to the data promise
    // this allows a more elegant API than Promise.all([promises])
    // since we use only a single promise the "encapsulates" the
    // previous ones
    
    // TODO: hide this._promise.data through a closure?
    
    // TODO: we only fulfill with most recent data - should
    // we not *always* fulfill with canonical data i.e. the
    // underlying selection, or keep canonical data and refresh
    // selection always?
    // Also, we need to keep data that has no entities in the geometry
    // e.g. for loading stats of aggregated entities. We could
    // use a global array of GeoJSON features, as this allows
    // either geometry or properties to be null -- fl 2015-11-21

    var map = this;
    
    if (promise) {
        if (this._promise.data) {
            this._promise.data = new Promise(function(resolve, reject) {
                map._promise.data.then(function(_) {
                    promise.then(function(data) {
                        resolve(data);
                    });
                });
            });
        }
        else {
            this._promise.data = promise;
        }
    }
    return this._promise.data;   
};

mapmap.prototype.then = function(callback) {
    this.promise_data().then(callback);
    return this;
};

// TODO: think about caching loaded resources (#8)
mapmap.prototype.data = function(spec, keyOrOptions) {

    var options = dd.isDictionary(keyOrOptions) ? keyOrOptions : {map: keyOrOptions};
    
    options = dd.merge({
        geometryKey: '__key__' // natural key
        // map: datdata default
        // reduce: datdata default
    }, options);
        
    var map = this;
    
    if (typeof spec == 'function') {
        this.promise_data().then(function(data){
            // TODO: this is a mess, see above - data
            // doesn't contain the actual canonical data, but 
            // only the most recently requested one, which doesn't
            // help us for transformations
            map._elements.geometry.selectAll('path')
            .each(function(geom) {
                if (geom.properties) {
                    var val = spec(geom.properties);
                    if (val) {
                        mapmap.extend(geom.properties, val);
                    }
                }
            });
        });
    }
    else {
        this.promise_data(dd(spec, options.map, options.reduce, options))
        .then(function(data) {
            if (data.length() == 0) {
                console.warn("Data for key '" + options.map + "' yielded no results!");
            }
            map._elements.geometry.selectAll('path')
                .each(function(d) {
                    if (d.properties) {
                        var k = d.properties[options.geometryKey];
                        if (k) {
                            mapmap.extend(d.properties, data.get(k));
                        }
                        else {
                            //console.warn("Key '" + options.geometryKey + "' not found in " + this + "!");
                        }    
                    }
                });
        });
    }
    return this;
};

var MetaDataSpec = function(key, fields) {
    // ensure constructor invocation
    if (!(this instanceof MetaDataSpec)) return new MetaDataSpec(key, fields);
    mapmap.extend(this, fields);
    this.key = key;
    return this;
};
MetaDataSpec.prototype.specificity = function() {
    // regex case. use length of string representation without enclosing /.../
    if (this.key instanceof RegExp) return this.key.toString()-2;
    // return number of significant letters
    return this.key.length - (this.key.match(/[\*\?]/g) || []).length;
};
MetaDataSpec.prototype.match = function(str) {
    if (this.key instanceof RegExp) return (str.search(this.key) == 0);
    var rex = new RegExp('^' + this.key.replace('*','.*').replace('?','.'));
    return (str.search(rex) == 0);
};
var MetaData = function(fields, localeProvider) {
    // ensure constructor invocation
    if (!(this instanceof MetaData)) return new MetaData(fields, localeProvider);
    mapmap.extend(this, fields);
    // take default from locale
    if (!this.undefinedLabel) this.undefinedLabel = localeProvider.locale.undefinedLabel;
    
    this.format = function(val) {
        if (!this._format) {
            this._format = this.getFormatter();
        }
        // return undefined if undefined or if not a number but number formatting explicitly requested
        if (val === undefined || val === null || (this.numberFormat && (isNaN(val)))) {
            return this.undefinedValue;
        }
        return this._format(val);
    };
    this.getFormatter = function() {
        if (this.scale == 'ordinal' && this.valueLabels) {
            var scale = d3.scale.ordinal().domain(this.domain).range(this.valueLabels);
            return scale;
        }
        if (this.numberFormat && typeof this.numberFormat == 'function') {
            return this.numberFormat;
        }
        if (localeProvider.locale) {
            return localeProvider.locale.numberFormat(this.numberFormat || '.01f');
        }
        return d3.format(this.numberFormat || '.01f');
    };
    this.getRangeFormatter = function() {
        var fmt = this.format.bind(this);
        return function(lower, upper, excludeLower, excludeUpper) {
            if (localeProvider.locale && localeProvider.locale.rangeLabel) {
                return localeProvider.locale.rangeLabel(lower, upper, fmt, excludeLower, excludeUpper);
            }
            return defaultRangeLabel(lower, upper, fmt, excludeLower, excludeUpper);
        }
    };
    return this;
};

mapmap.prototype.meta = function(metadata){
    var keys = Object.keys(metadata);
    for (var i=0; i<keys.length; i++) {
        this.metadata_specs.push(MetaDataSpec(keys[i], metadata[keys[i]]));
    }
    this.metadata_specs.sort(function(a,b) {
        return a.specificity()-b.specificity();
    });
    return this;
};

mapmap.prototype.getMetadata = function(key) {
    if (!this.metadata) {
        this.metadata = {};
    }
    if (!this.metadata[key]) {
        var fields = mapmap.extend({}, this.settings.defaultMetadata);
        for (var i=0; i<this.metadata_specs.length; i++) {
            if (this.metadata_specs[i].match(key)) {
                mapmap.extend(fields, this.metadata_specs[i]);
            }
        }
        this.metadata[key] = MetaData(fields, this);
    }
    return this.metadata[key];
};

function getStats(data, valueFunc) {
    var stats = {
        count: 0,
        countNumbers: 0,
        anyNegative: false,
        anyPositive: false,
        anyStrings: false,
        min: undefined,
        max: undefined
    };
    function datumFunc(d) {
        var val = valueFunc(d);
        if (val !== undefined) {
            stats.count += 1;
            if (dd.isNumeric(val)) {
                val = +val;
                stats.countNumbers += 1;
                if (stats.min === undefined) stats.min = val;
                if (stats.max === undefined) stats.max = val;
                if (val < stats.min) stats.min = val;
                if (val > stats.max) stats.max = val;
                if (val > 0) stats.anyPositive = true;
                if (val < 0) stats.anyNegative = true;
            }
            else if (val) {
                stats.anyString = true;
            }
        }
    }
    if (data.each && typeof data.each == 'function') {
        data.each(datumFunc);
    }
    else {
        for (var i=0; i<data.length; i++) {
            datumFunc(data[i]);
        }
    }
    return stats;
}

function properties_accessor(func) {
    // converts a data callback function to access data's .properties entry
    // useful for processing geojson objects
    return function(data) {
        if (data.properties) return func(data.properties);
    };
}

mapmap.prototype.autoColorScale = function(value, metadata, selection) {
    
    if (!metadata) {
        metadata = this.getMetadata(value);
    }
    else {
        metadata = dd.merge(this.settings.defaultMetadata, metadata);
    }
    
    if (!metadata.domain) {
        var stats = getStats(this.getRepresentations(selection), properties_accessor(keyOrCallback(value)));
        
        if (stats.anyNegative && stats.anyPositive) {
            // make symmetrical
            metadata.domain = [Math.min(stats.min, -stats.max), Math.max(stats.max, -stats.min)];
        }
        else {
            metadata.domain = [stats.min,stats.max];
        }
    }
    // support d3 scales out of the box
    var scale = d3.scale[metadata.scale]();
    scale.domain(metadata.domain).range(metadata.color || metadata.colors)
    
    if (metadata.scale == 'ordinal' && !scale.invert) {
        // d3 ordinal scales don't provide invert method, so patch one here
        // https://github.com/mbostock/d3/pull/598
        scale.invert = function(x) {
            var i = scale.range().indexOf(x);
            return (i > -1) ? metadata.domain[i] : null;
        }
    }
    
    return scale;    
};

mapmap.prototype.autoLinearScale = function(valueFunc) {    
    var stats = getStats(this._elements.geometry.selectAll('path'), properties_accessor(valueFunc));    
    return d3.scale.linear()
        .domain([0,stats.max]);    
};
mapmap.prototype.autoSqrtScale = function(valueFunc) {    
    var stats = getStats(this._elements.geometry.selectAll('path'), properties_accessor(valueFunc));    
    return d3.scale.sqrt()
        .domain([0,stats.max]);    
};

mapmap.prototype.attr = function(name, value, selection) {
    if (dd.isDictionary(name) && value) {
        selection = value;
        value = undefined;
    }
    this.symbolize(function(repr) {
        repr.attr(name, value);
    }, selection);
    return this;
};

mapmap.prototype.zOrder = function(comparator, options) {
    
    options = dd.merge({
        undefinedValue: Infinity
    }, options);

    if (dd.isString(comparator)) {
        var fieldName = comparator;
        var reverse = false;
        if (fieldName[0] == "-") {
            reverse = true;
            fieldName = fieldName.substring(1);
        }
        comparator = function(a,b) {
            var valA = a.properties[fieldName],
                valB = b.properties[fieldName];
                
            if (valA === undefined || isNaN(valA)) {
                valA = options.undefinedValue;
            }
            if (valB === undefined || isNaN(valB)) {
                valB = options.undefinedValue;
            }
            var result = valA - valB;
            if (reverse) result *= -1;
            return result;
        }
    }
    
    var map = this;
    this.promise_data().then(function(data) {      
        map.getRepresentations()
            .sort(comparator);
    });
    return this;
};

// TODO: right now, symbolize doesn't seem to be any different from applyBehavior!
// either this should be unified, or the distinctions clearly worked out
mapmap.prototype.symbolize = function(callback, selection, finalize) {

    var map = this;
    
    // store in closure for later access
    selection = selection || this.selected;
    this.promise_data().then(function(data) {      
        map.getRepresentations(selection)
            .each(function(geom) {
                callback.call(map, d3.select(this), geom, geom.properties);
            });
        if (finalize) finalize.call(map);
    });
    return this;
};

mapmap.prototype.symbolizeAttribute = function(spec, reprAttribute, metaAttribute, selection) {

    var defaultUndefinedAttributes = {
        'stroke': 'transparent'  
    };
    
    var valueFunc = keyOrCallback(spec);

    metaAttribute = metaAttribute || reprAttribute;    
    selection = selection || this.selected;

    
    var map = this;
    
    this.promise_data().then(function(data) {      

        var metadata = map.getMetadata(spec);

        var scale = d3.scale[metadata.scale]();
        scale.domain(metadata.domain).range(metadata[metaAttribute]);

        map.symbolize(function(el, geom, data) {
            el.attr(reprAttribute, function(geom) {
                var val = valueFunc(geom.properties);
                if (val == null || (metadata.scale != 'ordinal' && isNaN(val))) {
                    return (metadata.undefinedValues && metadata.undefinedValues[reprAttribute]) || defaultUndefinedAttributes[reprAttribute];
                }
                return scale(val);
            });
        }, selection);

        map.updateLegend(spec, reprAttribute, metadata, scale, selection);
    });
    
    return this;
    
}


// TODO: improve handling of using a function here vs. using a named property
// probably needs a unified mechanism to deal with property/func to be used elsewhere
mapmap.prototype.choropleth = function(spec, metadata, selection) {    
    // we have to remember the scale for legend()
    var colorScale = null,
        valueFunc = keyOrCallback(spec),
        map = this;
        
    function color(el, geom, data) {
        if (spec === null) {
            // clear
            el.attr('fill', this.settings.pathAttributes.fill);
            return;
        }
        // on first call, set up scale & legend
        if (!colorScale) {
            // TODO: improve handling of things that need the data, but should be performed
            // only once. Should we provide a separate callback for this, or use the 
            // promise_data().then() for setup? As this could be considered a public API usecase,
            // maybe using promises is a bit steep for outside users?
            if (typeof metadata == 'string') {
                metadata = this.getMetadata(metadata);
            }
            if (!metadata) {
                metadata = this.getMetadata(spec);
            }
            colorScale = this.autoColorScale(spec, metadata, selection);
            this.updateLegend(spec, 'fill', metadata, colorScale, selection);
        }
        if (el.attr('fill') != 'none') {
            // transition if color already set
            el = el.transition();
        }
        el.attr('fill', function(geom) {           
            var val = valueFunc(geom.properties);
            // check if value is undefined or null
            if (val == null || (metadata.scale != 'ordinal' && isNaN(val))) {
                return metadata.undefinedColor || map.settings.pathAttributes.fill;
            }
            return colorScale(val) || map.settings.pathAttributes.fill;
        });
    }
    
    this.symbolize(color, selection, function(){
        this.dispatcher.choropleth.call(this, spec);
    });
        
    return this;
};

// TODO: this should be easily implemented using symbolizeAttribute and removed
mapmap.prototype.strokeColor = function(spec, metadata, selection) {    
    // we have to remember the scale for legend()
    var colorScale = null,
        valueFunc = keyOrCallback(spec),
        map = this;
        
    function color(el, geom, data) {
        if (spec === null) {
            // clear
            el.attr('stroke', this.settings.pathAttributes.stroke);
            return;
        }
        // on first call, set up scale & legend
        if (!colorScale) {
            // TODO: improve handling of things that need the data, but should be performed
            // only once. Should we provide a separate callback for this, or use the 
            // promise_data().then() for setup? As this could be considered a public API usecase,
            // maybe using promises is a bit steep for outside users?
            if (typeof metadata == 'string') {
                metadata = this.getMetadata(metadata);
            }
            if (!metadata) {
                metadata = this.getMetadata(spec);
            }
            colorScale = this.autoColorScale(spec, metadata, selection);
            this.updateLegend(spec, 'strokeColor', metadata, colorScale, selection);
        }
        if (el.attr('stroke') != 'none') {
            // transition if color already set
            el = el.transition();
        }
        el.attr('stroke', function(geom) {           
            var val = valueFunc(geom.properties);
            // check if value is undefined or null
            if (val == null || (metadata.scale != 'ordinal' && isNaN(val))) {
                return metadata.undefinedColor || map.settings.pathAttributes.stroke;
            }
            return colorScale(val) || map.settings.pathAttributes.stroke;
        });
    }
    
    this.symbolize(color, selection);
        
    return this;
};

// TODO: should we even have this, or put viz. techniques in a separate project/namespace?
mapmap.prototype.proportional_circles = function(value, scale) {
    
    var valueFunc = keyOrCallback(value);

    var pathGenerator = d3.geo.path().projection(this._projection);    
    
    scale = scale || 20;
    
    this.symbolize(function(el, geom, data) {
        if (value === null) {
            this._elements.overlay.select('circle').remove();
        }
        else if (geom.properties && typeof valueFunc(geom.properties) != 'undefined') {
            // if scale is not set, calculate scale on first call
            if (typeof scale != 'function') {
                scale = this.autoSqrtScale(valueFunc).range([0,scale]);
            }
            var centroid = pathGenerator.centroid(geom);
            this._elements.overlay.append('circle')
                .attr(this.settings.overlayAttributes)
                .attr({
                    r: scale(valueFunc(geom.properties)),
                    cx: centroid[0],
                    cy: centroid[1]
                });
        }
    });
    return this;
};

mapmap.symbolize = {};

mapmap.symbolize.addLabel = function(spec) {

    var valueFunc = keyOrCallback(spec);
        
    var pathGenerator = d3.geo.path();    

    return function(el, geom, data) {
        // lazy initialization of projection
        // we dont't have access to the map above, and also projection
        // may not have been initialized correctly
        if (pathGenerator.projection() !== this._projection) {
            pathGenerator.projection(this._projection);
        }

        // TODO: how to properly remove symbolizations?
        if (spec === null) {
            this._elements.overlay.select('circle').remove();
            return;
        }
        
        if (geom.properties && typeof valueFunc(geom.properties) != 'undefined') {
            var centroid = pathGenerator.centroid(geom);
            this._elements.overlay.append('text')
                .text(valueFunc(geom.properties))
                .attr({
                    stroke: '#ffffff',
                    fill: '#000000',
                    'font-size': 9,
                    'paint-order': 'stroke fill',
                    'alignment-baseline': 'middle',
                    dx: 7,
                    dy: 1
                })
                .attr({                    
                    x: centroid[0],
                    y: centroid[1]
                })
            ;
        }
    }
}

function addOptionalElement(elementName) {
    return function(value) {
        var valueFunc = keyOrCallback(value);
        this.symbolize(function(el, d) {  
            if (value === null) {
                el.select(elementName).remove();
                return;
            }
            el.append(elementName)
                .text(valueFunc(d.properties));
        });
        return this;
    };
}

mapmap.prototype.title = addOptionalElement('title');
mapmap.prototype.desc = addOptionalElement('desc');

var center = {
    x: 0.5,
    y: 0.5
};

mapmap.prototype.center = function(center_x, center_y) {
    center.x = center_x;
    if (typeof center_y != 'undefined') {
        center.y = center_y;
    }
    return this;
};
// store all hover out callbacks here, this will be called on zoom
var hoverOutCallbacks = [];

function callHoverOut() {
    for (var i=0; i<hoverOutCallbacks.length; i++) {
        hoverOutCallbacks[i]();
    }
}

var mouseover = null;

mapmap.showHover = function(el) {
    if (mouseover) {
        mouseover.call(el, el.__data__);
    }
};

mapmap.prototype.getAnchorForRepr = function(event, repr, options) {

    options = dd.merge({
        clipToViewport: true,
        clipMargins: {top: 40, left: 40, bottom: 0, right: 40}
    }, options);
    
    var bounds = repr.getBoundingClientRect();
    var pt = this._elements.main.node().createSVGPoint();
    
    pt.x = (bounds.left + bounds.right) / 2;
    pt.y = bounds.top;
    
    var mapBounds = this.getBoundingClientRect();
    
    if (options.clipToViewport) {  
        if (pt.x < mapBounds.left + options.clipMargins.left) pt.x = mapBounds.left + options.clipMargins.left;
        if (pt.x > mapBounds.right - options.clipMargins.right) pt.x = mapBounds.right - options.clipMargins.right;
        if (pt.y < mapBounds.top + options.clipMargins.top) pt.y = mapBounds.top + options.clipMargins.top;
        if (pt.y > mapBounds.bottom - options.clipMargins.bottom) pt.y = mapBounds.bottom - options.clipMargins.bottom;
    }
    pt.x -= mapBounds.left;
    pt.y -= mapBounds.top;

    return pt;
}

mapmap.prototype.getAnchorForMousePosition = function(event, repr, options) {
     
    options = dd.merge({
        anchorOffset: [0,-20]
     }, options);

     // http://www.jacklmoore.com/notes/mouse-position/
     var offsetX = event.layerX || event.offsetX,
         offsetY = event.layerY || event.offsetY;
    
    return {
        x: offsetX + options.anchorOffset[0],
        y: offsetY + options.anchorOffset[1]
    }
}


mapmap.prototype.hover = function(overCB, outCB, options) {

    options = dd.merge({
        moveToFront: true,
        clipToViewport: true,
        clipMargins: {top: 40, left: 40, bottom: 0, right: 40},
        selection: null,
        anchorPosition: this.getAnchorForRepr
     }, options);
    
    var map = this;
    
    if (!this._oldPointerEvents) {
        this._oldPointerEvents = [];
    }
    
    this.promise_data().then(function() {
        var obj = map.getRepresentations(options.selection);
        mouseover = function(d) {
            // "this" is the SVG element, not the map!
            // move to top = end of parent node
            // this screws up IE event handling!
            if (options.moveToFront && map.supports.hoverDomModification) {
                // TODO: this should be solved via a second element to be placed in front!
                this.__hoverinsertposition__ = this.nextSibling;
                this.parentNode.appendChild(this);
            }
            
            var el = this,
                event = d3.event;
            
            // In Firefox the event positions are not populated properly in some cases
            // Defer call to allow browser to populate the event
            window.setTimeout(function(){
                var anchor = options.anchorPosition.call(map, event, el, options);           
                overCB.call(map, d.properties, anchor, el);   
            }, 10);
        };
        // reset previously overridden pointer events
        for (var i=0; i<map._oldPointerEvents.length; i++) {
            var pair = map._oldPointerEvents[i];
            pair[0].style('pointer-events', pair[1]);
        }
        map._oldPointerEvents = [];
        if (overCB) {
            obj
                .on('mouseenter', mouseover)
                .each(function(){
                    // TODO: not sure if this is the best idea, but we need to make sure
                    // to receive pointer events even if css disables them. This has to work
                    // even for complex (function-based) selections, so we cannot use containment
                    // selectors (e.g. .selected-foo .foo) for this...
                    // https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/pointer-events
                    var sel = d3.select(this);
                    map._oldPointerEvents.push([sel, sel.style('pointer-events')]);
                    // TODO: this should be configurable via options
                    //sel.style('pointer-events','all');
                    sel.style('pointer-events','visiblePainted');
                })
            ;
        }
        else {
            obj.on('mouseenter', null);
        }
        if (outCB) {
            obj.on('mouseleave', function() {
                if (this.__hoverinsertposition__) {
                    this.parentNode.insertBefore(this, this.__hoverinsertposition__);
                }
                // we need to defer this call as well to make sure it is
                // always called after overCB (see above Ffx workaround)
                window.setTimeout(function(){
                    outCB.call(map);   
                }, 10);
            });
            hoverOutCallbacks.push(outCB);
        }
        else {
            obj.on('mouseleave', null);
        }          
    });
    return this;
};

mapmap.prototype.formatValue = function(d, attr) {
    var meta = this.getMetadata(attr),
        val = meta.format(d[attr]);
    if (val == 'NaN') val = d[attr];
    return val;
};

mapmap.prototype.buildHTMLFunc = function(spec) {
    // function case
    if (typeof spec == 'function') return spec;
    // string case
    if (spec.substr) spec = [spec];
    
    var map = this;
    
    var func = function(d) {
        var html = "",
            pre, post;
        for (var i=0; i<spec.length; i++) {
            var part = spec[i];
            if (part) {
                pre = (i==0) ? '<b>' : '';
                post = (i==0) ? '</b><br>' : '<br>';
                if (typeof part == 'function') {
                    var str = part.call(map, d);
                    if (str) {
                        html += pre + str + post;
                    }
                    continue;
                }
                var meta = map.getMetadata(part);
                var prefix = meta.hoverLabel || meta.valueLabel || meta.label || '';
                if (prefix) prefix += ": ";
                var val = meta.format(d[part]);
                if (val == 'NaN') val = d[part];
                // TODO: make option "ignoreUndefined" etc.
                if (val !== undefined && val !== meta.undefinedValue) {
                    html += pre + prefix + val + ( meta.valueUnit ? '&nbsp;' + meta.valueUnit : '') + post;
                }
                else if (meta.undefinedLabel) {
                    html += pre + prefix + meta.undefinedLabel + post;
                }
            }
        }
        return html;
    };
    
    return func;
};

mapmap.prototype.hoverInfo = function(spec, options) {

    options = dd.merge({
        selection: null,
        hoverClassName: 'hoverInfo',
        hoverStyle: {
            position: 'absolute',
            padding: '0.5em 0.7em',
            'background-color': 'rgba(255,255,255,0.85)',
            // avoid clipping DIV to right edge of map 
            'white-space': 'nowrap',
            'z-index': '2'
        },
        hoverEnterStyle: {
            display: 'block'
        },
        hoverLeaveStyle: {
            display: 'none'
        }
    }, options);
    
    var hoverEl = this._elements.parent.select('.' + options.hoverClassName);

    if (!spec) {
        return this.hover(null, null, options);
    }

    var htmlFunc = this.buildHTMLFunc(spec);
    if (hoverEl.empty()) {
        hoverEl = this._elements.parent.append('div').attr('class',options.hoverClassName);
    }
    hoverEl.style(options.hoverStyle);
    if (!hoverEl.mapmap_eventHandlerInstalled) {
        hoverEl.on('mouseenter', function() {
            hoverEl.style(options.hoverEnterStyle);
        }).on('mouseleave', function() {
            hoverEl.style(options.hoverLeaveStyle);
        });
        hoverEl.mapmap_eventHandlerInstalled = true;
    }
    
    function show(d, point){
        // offsetParent only works for rendered objects, so place object first!
        // https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement.offsetParent
        hoverEl.style(options.hoverEnterStyle);  
        
        var offsetEl = hoverEl.node().offsetParent || hoverEl,
            mainEl = this._elements.main.node(),
            bounds = this.getBoundingClientRect(),
            offsetBounds = offsetEl.getBoundingClientRect(),
            scrollTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0,
            scrollLeft = window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft || 0,
            top = bounds.top - offsetBounds.top,
            left = bounds.left - offsetBounds.left;

        hoverEl
            .style({
                bottom: (offsetBounds.height - top - point.y) + 'px',
                //top: point.y + 'px',
                left: (left + point.x) + 'px'
            })
            .html(htmlFunc(d));
    }
    function hide() {
        hoverEl.style(options.hoverLeaveStyle);
    }
    
    return this.hover(show, hide, options);
};

// remove all symbology
// TODO: symbolizers should be registered somehow and iterated over here
mapmap.prototype.clear = function() {
    this.choropleth(null);
    this.proportional_circles(null);
    this.title(null);
    this.desc(null);
    return this;
};

// namespace for re-usable behaviors
mapmap.behavior = {};

mapmap.behavior.zoom = function(options) {

    options = dd.merge({
        event: 'click',
        cursor: 'pointer',
        fitScale: 0.7,
        animationDuration: 750,
        maxZoom: 8,
        hierarchical: false,
        showRing: true,
        ringRadius: 1.1, // relative to height/2
        zoomstart: null,
        zoomend: null,
        center: [center.x, center.y],
        ringAttributes: {
            stroke: '#000',
            'stroke-width': 6,
            'stroke-opacity': 0.3,
            'pointer-events': 'none',
            fill: 'none'
        },
        closeButton: function(parent) {
            parent.append('circle')
                .attr({
                    r: 10,
                    fill: '#fff',
                    stroke: '#000',
                    'stroke-width': 2.5,
                    'stroke-opacity': 0.9,
                    'fill-opacity': 0.9,
                    cursor: 'pointer'
                });
                
            parent.append('text')
                .attr({
                    'text-anchor':'middle',
                    cursor: 'pointer',
                    'font-weight': 'bold',
                    'font-size': '18',
                    y: 6
                })
                .text('×');
        },
        // TODO: how should highlighting work on the map generally?
        // maybe more like setState('highlight') and options.activestyle = 'highlight' ?
        activate: function(el) {
            d3.select(el).classed('active', true);
        },
        deactivate: function(el) {
            if (el) d3.select(el).classed('active', false);
        }        
    }, options);
    
    var ring = null,
        map = null,
        r, r0,
        zoomed = null;
    
    var z = function(selection) {
            
        map = this;

        var size = this.size();
        
        r = Math.min(size.height, size.width) / 2.0 * options.ringRadius;
        r0 = Math.sqrt(size.width*size.width + size.height*size.height) / 1.5;
            
        if (options.cursor) {
            selection.attr({
                cursor: options.cursor
            });
        }
        
        if (options.showRing && !ring) {
            ring = map._elements.fixed.selectAll('g.zoomRing')
                .data([1]);
            
            var newring = ring.enter()
                .append('g')
                .attr('class','zoomRing')
                .attr('transform','translate(' + size.width * options.center[0] + ',' + size.height * options.center[1] + ')');
                       
            newring.append('circle')
                .attr('class', 'main')
                .attr('r', r0)
                .attr(options.ringAttributes);
                
            var close = newring.append('g')
                .attr('class','zoomOut')
                .attr('transform','translate(' + (r0 * 0.707) + ',-' + (r0 * 0.707) + ')');
                        
            if (options.closeButton) {
                options.closeButton(close);
            }
            
        }

        // this is currently needed if e.g. search zooms to somewhere else,
        // but map is still zoomed in through this behavior
        // do a reset(), but without modifying the map view (=zooming out)
        map.on('view', function(translate, scale) {
            if (zoomed && scale == 1) {
                zoomed = null;
                animateRing(null);
                map._elements.map.select('.background').on(options.event + '.zoom', null);
                options.zoomstart && options.zoomstart.call(map, null);
                options.zoomend && options.zoomend.call(map, null);
            }
        });
                
        selection.on(options.event, function(d) {
            callHoverOut();
            if (zoomed == this) {
                reset();
            }
            else {
                options.deactivate(zoomed);
                var el = this;
                options.zoomstart && options.zoomstart.call(map, el);
                map.zoomToSelection(this, {
                    callback: function() {
                        options.zoomend && options.zoomend.call(map, el);
                    },
                    maxZoom: options.maxZoom,
                    center: options.center
                });
                animateRing(this);
                options.activate(this);
                zoomed = this;
                map._elements.map.select('.background').on(options.event + '.zoom', reset);
            }
        });

        if (zoomed) {
            options.zoomstart && options.zoomstart.call(map, zoomed);
            options.zoomend && options.zoomend.call(map, zoomed);
        }

    };
    
    function zoomTo(selection) {
        options.zoomstart && options.zoomstart.call(map, selection);
        map.zoomToSelection(selection, {
            callback: function() {
                options.zoomend && options.zoomend.call(map, selection);
            },
            maxZoom: options.maxZoom,
            center: options.center
        });
        animateRing(selection);
        zoomed = selection;
        map._elements.map.select('.background').on(options.event + '.zoom', reset);
    }

    function animateRing(selection) {
        if (ring) {
            var new_r = (selection) ? r : r0;
            
            ring.select('circle.main').transition().duration(options.animationDuration)
                .attr({
                    r: new_r
                })
            ;
            ring.select('g.zoomOut').transition().duration(options.animationDuration)
                .attr('transform', 'translate(' + (new_r * 0.707) + ',-' + (new_r * 0.707) + ')'); // sqrt(2) / 2

            // caveat: make sure to assign this every time to apply correct closure if we have multiple zoom behaviors!!
            ring.select('g.zoomOut').on('click', reset);
        }
    }
        
    function reset() {
        if (map) {
            options.deactivate(zoomed);
            zoomed = null;
            map.resetZoom();
            animateRing(null);
            map._elements.map.select('.background').on(options.event + '.zoom', null);
            if (options.zoomstart) {
                options.zoomstart.call(map, null);
            }
            if (options.zoomend) {
                options.zoomend.call(map, null);
            }
        }
    }
    
    z.reset = reset;
    
    z.active = function() {
        return zoomed;
    };   

    z.remove = function() {
        reset();
    };
        
    z.from = function(other){
        if (other && other.active) {
            zoomed = other.active();
            /*
            if (zoomed) {
                zoomTo(zoomed);
            }
            */
            // TODO: make up our mind whether this should remove the other behavior
            // in burgenland_demographie.html, we need to keep it as it would otherwise zoom out
            // but if we mix different behaviors, we may want to remove the other one automatically
            // (or maybe require it to be done manually)
            // in pendeln.js, we remove the other behavior here, which is inconsistent!
            
            //other.remove();
        }
        return z;
    };
    
    return z;
};

mapmap.prototype.animateView = function(translate, scale, callback, duration) {

    duration = duration || 750;
    
    if (translate[0] == this.current_translate[0] && translate[1] == this.current_translate[1] && scale == this.current_scale) {
        // nothing to do
        // yield to simulate async callback
        if (callback) {
            window.setTimeout(callback, 10);
        }
        return this;
    }
    this.current_translate = translate;
    this.current_scale = scale;
    callHoverOut();
    var map = this;
    this._elements.map.transition()
        .duration(duration)
        .call(map.zoom.translate(translate).scale(scale).event)
        .each('start', function() {
            map._elements.shadowGroup.attr('display','none');
        })
        .each('end', function() {
            map._elements.shadowGroup.attr('display','block');
            if (callback) {
                callback();
            }
        })
        .each('interrupt', function() {
            map._elements.shadowGroup.attr('display','block');
            // not sure if we should call callback here, but it may be non-intuitive
            // for callback to never be called if zoom is cancelled
            if (callback) {
                callback();
            }
        });        
    this.dispatcher.view.call(this, translate, scale);
    return this;
};

mapmap.prototype.setView = function(translate, scale) {

    translate = translate || this.current_translate;
    scale = scale || this.current_scale;
    
    this.current_translate = translate;
    this.current_scale = scale;
      
    // do we need this?
    //callHoverOut();

    this.zoom.translate(translate).scale(scale).event(this._elements.map);

    this.dispatcher.view.call(this, translate, scale);
    return this;
};

mapmap.prototype.getView = function() {
    return {
        translate: this.current_translate,
        scale: this.current_scale
    }
};

mapmap.prototype.zoomToSelection = function(selection, options) {
    
    options = dd.merge({
        fitScale: 0.7,
        animationDuration: 750,
        maxZoom: 8,
        center: [center.x, center.y]
    }, options);

    var sel = this.getRepresentations(selection),
        bounds = [[Infinity,Infinity],[-Infinity, -Infinity]],
        pathGenerator = d3.geo.path().projection(this._projection);    
    
    sel.each(function(el){
        var b = pathGenerator.bounds(el);
        bounds[0][0] = Math.min(bounds[0][0], b[0][0]);
        bounds[0][1] = Math.min(bounds[0][1], b[0][1]);
        bounds[1][0] = Math.max(bounds[1][0], b[1][0]);
        bounds[1][1] = Math.max(bounds[1][1], b[1][1]);
    });
    
    var dx = bounds[1][0] - bounds[0][0],
        dy = bounds[1][1] - bounds[0][1],
        x = (bounds[0][0] + bounds[1][0]) / 2,
        y = (bounds[0][1] + bounds[1][1]) / 2,
        size = this.size(),
        scale = Math.min(options.maxZoom, options.fitScale / Math.max(dx / size.width, dy / size.height)),
        translate = [size.width * options.center[0] - scale * x, size.height * options.center[1] - scale * y];
    this.animateView(translate, scale, options.callback, options.animationDuration);
    return this;
};

mapmap.prototype.zoomToBounds = function(bounds, callback, duration) {
    var w = bounds[1][0]-bounds[0][0],
        h = bounds[1][1]-bounds[0][1],
        cx = (bounds[1][0]+bounds[0][0]) / 2,
        cy = (bounds[1][1]+bounds[0][1]) / 2,
        size = this.size(),
        scale = Math.min(2, 0.9 / Math.max(w / size.width, h / size.height)),
        translate = [size.width * 0.5 - scale * cx, size.height * 0.5 - scale * cy];
    
    return this.animateView(translate, scale, callback, duration);
};

mapmap.prototype.zoomToCenter = function(center, scale, callback, duration) {

    scale = scale || 1;
    
    var size = this.size(),
        translate = [size.width * 0.5 - scale * center[0], size.height * 0.5 - scale * center[1]];

    return this.animateView(translate, scale, callback, duration);
};

mapmap.prototype.zoomToViewportPosition = function(center, scale, callback, duration) {

    var point = this._elements.main.node().createSVGPoint();

    point.x = center[0];
    point.y = center[1];

    var ctm = this._elements.geometry.node().getScreenCTM().inverse();
    point = point.matrixTransform(ctm);

    point = [point.x, point.y];
    
    scale = scale || 1;
    
    //var point = [(center[0]-this.current_translate[0])/this.current_scale, (center[1]-this.current_translate[1])/this.current_scale];
    
    return this.zoomToCenter(point, scale, callback, duration);
};

mapmap.prototype.resetZoom = function(callback, duration) {
    return this.animateView([0,0],1, callback, duration);
    // TODO take center into account zoomed-out, we may not always want this?
    //doZoom([width * (center.x-0.5),height * (center.y-0.5)],1);
};


// Manipulate representation geometry. This can be used e.g. to register event handlers.
// spec is a function to be called with selection to set up event handler
mapmap.prototype.applyBehavior = function(spec, selection) {

    assert(dd.isFunction(spec), "Behavior must be a function");
    
    var map = this;
    this._promise.geometry.then(function(topo) {
        var sel = map.getRepresentations(selection);
        // TODO: this should be configurable via options
        // and needs to integrate with managing pointer events (see hoverInfo)
        sel.style('pointer-events','visiblePainted');
        spec.call(map, sel);
    });
    return this;
};


// apply a behavior on the whole map pane (e.g. drag/zoom etc.)
mapmap.prototype.applyMapBehavior = function(spec) {
    spec.call(this, this._elements.map);
    return this;
};


// deprecated methods using UK-spelling
mapmap.prototype.applyBehaviour = function(spec, selection) {
    console && console.log && console.log("Deprecation warning: applyBehaviour() is deprecated, use applyBehavior() (US spelling) instead!");
    return this.applyBehavior(spec, selection);
}
mapmap.prototype.applyMapBehaviour = function(spec, selection) {
    console && console.log && console.log("Deprecation warning: applyMapBehaviour() is deprecated, use applyMapBehavior() (US spelling) instead!");
    return this.applyMapBehavior(spec, selection);
}

// handler for high-level events on the map object
mapmap.prototype.on = function(eventName, handler) {
    this.dispatcher.on(eventName, handler);
    return this;
};

function defaultRangeLabel(lower, upper, format, excludeLower, excludeUpper) {
    var f = format || function(lower){return lower};
        
    if (isNaN(lower)) {
        if (isNaN(upper)) {
            console.warn("rangeLabel: neither lower nor upper value specified!");
            return "";
        }
        else {
            return (excludeUpper ? "under " : "up to ") + f(upper);
        }
    }
    if (isNaN(upper)) {
        return excludeLower ? ("more than " + f(lower)) : (f(lower) + " and more");
    }
    return (excludeLower ? '> ' : '') + f(lower) + " to " + (excludeUpper ? '<' : '') + f(upper);
}

var d3_locales = {
    'en': {
        decimal: ".",
        thousands: ",",
        grouping: [ 3 ],
        currency: [ "$", "" ],
        dateTime: "%a %b %e %X %Y",
        date: "%m/%d/%Y",
        time: "%H:%M:%S",
        periods: [ "AM", "PM" ],
        days: [ "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday" ],
        shortDays: [ "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat" ],
        months: [ "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December" ],
        shortMonths: [ "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec" ],
        rangeLabel: defaultRangeLabel,
        undefinedLabel: "no data"
    },
    'de': {
        decimal: ",",
        thousands: ".",
        grouping: [3],
        currency: ["€", ""],
        dateTime: "%a %b %e %X %Y",
        date: "%d.%m.%Y",
        time: "%H:%M:%S",
        periods: ["AM", "PM"],
        days: ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"],
        shortDays: ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"],
        months: ["Jänner", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"],
        shortMonths: ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sep.", "Okt.", "Nov.", "Dez."],
        rangeLabel: function(lower, upper, format, excludeLower, excludeUpper) {
            var f = format || function(lower){return lower};
                
            if (isNaN(lower)) {
                if (isNaN(upper)) {
                    console.warn("rangeLabel: neither lower nor upper value specified!");
                    return "";
                }
                else {
                    return (excludeUpper ? "unter " : "bis ") + f(upper);
                }
            }
            if (isNaN(upper)) {
                return (excludeLower ? "mehr als " + f(lower) : f(lower) + " und mehr");
            }
            return (excludeLower ? '> ' : '') + f(lower) + " bis " + (excludeUpper ? '<' : '') + f(upper);
        },
        undefinedLabel: "keine Daten"
    }
};


mapmap.prototype.setLocale = function(lang){
    var locale;
    if (dd.isString(lang) && d3_locales[lang]) {
        locale = d3_locales[lang];
    }
    else {
        locale = lang;
    }
    this.locale = d3.locale(locale);
    
    // D3's locale doesn't support extended attributes,
    // so copy them over manually
    var keys = Object.keys(locale);
    for (var i=0; i<keys.length; i++) {
        var key = keys[i];
        if (!this.locale[key]) {
            this.locale[key] = locale[key];
        }
    }

    return this;
}

mapmap.prototype.options = function(spec, value) {

    // locale can be set through options but needs to be set up, so keep track of this here
    var oldLocale = this.settings.locale;

    mapmap.extend(this.settings, spec);
    
    if (this.settings.locale != oldLocale) {
        this.setLocale(this.settings.locale);
    }

    return this;
};

mapmap.prototype.legend = function(legend_func) {
    this.legend_func = legend_func;
    return this;
}
mapmap.prototype.updateLegend = function(attribute, reprAttribute, metadata, scale, selection) {

    if (!this.legend_func || !scale) {
        return this;
    }
    
    if (typeof metadata == 'string') {
        metadata = mapmap.getMetadata(metadata);
    }
    
    var range = scale.range(),
        classes,
        map = this; 

    var histogram = (function() {
        var data = null;
        return function(value) {
            // lazy initialization of histogram
            if (data == null) {
                data = {};
                var reprs = map.getRepresentations(selection)[0];
                reprs.forEach(function(repr) {
                    var val = repr.__data__.properties[attribute];
                    // make a separate bin for null/undefined values
                    // values are also invalid if numeric scale and non-numeric value
                    if (val == null || (metadata.scale != 'ordinal' && isNaN(val))) {
                        val = null;
                    }
                    else {
                        val = scale(val);
                    }
                    if (!data[val]) {
                        data[val] = [repr];
                    }
                    else {
                        data[val].push(repr);
                    }
                });
            }
            return data[value] || [];
        }
    })();
    
    function counter(r) {
        return function() {
            return histogram(r).length;
        }
    }   
    
    function objects(r) {
        return function() {
            return histogram(r);
        }
    }   
    
    // the main distinction is:
    // whether we have an output range divided into classes, or a continuous range
    // in the d3 API, numeric scales with a discrete range have an invertExtent method
    if (scale.invertExtent) {
        //classes = [scale.invertExtent(range[0])[0]];
        classes = range.map(function(r, i) {
            var extent = scale.invertExtent(r);
            // if we have too many items in range, both entries in extent will be undefined - ignore
            if (extent[0] == null && extent[1] == null) {
                console.warn("range for " + metadata.key + " contains superfluous value '" + r + "' - ignoring!");
                return null;
            }
            return {
                representation: r,
                valueRange: extent,
                includeLower: false,
                includeUpper: i<range.length-1,
                // lazy accessors - processing intensive
                count: counter(r),
                objects: objects(r)
                //TODO: other / more general aggregations?
            };
        })
        .filter(function(d){return d;});
    }
    else {
        // ordinal and continuous-range scales
        classes = range.map(function(r, i) {
            var value = undefined;
            if (scale.invert) {
                value = scale.invert(r);
            }
            return({
                representation: r,
                value: value,
                // lazy accessors - processing intensive
                count: counter(r),  
                objects: objects(r)
            });
        });
    }
    
    var undefinedClass = null;
    // TODO: hack to get undefined color box
    if (reprAttribute == 'fill' && metadata.undefinedColor != 'transparent') {
        undefinedClass = {
            representation: metadata.undefinedColor,
            'class': 'undefined',
            count: counter(null),
            objects: objects(null)
        };
    }
    
    this.legend_func.call(this, attribute, reprAttribute, metadata, classes, undefinedClass);
                    
    return this;

};

function valueOrCall(spec) {
    if (typeof spec == 'function') {
        return spec.apply(this, Array.prototype.slice.call(arguments, 1));
    }
    return spec;
}

// namespace for legend generation functions
mapmap.legend = {};

mapmap.legend.html = function(options) {

    var DEFAULTS = {
        legendClassName: 'mapLegend',
        legendStyle: {},
        cellStyle: {},
        colorBoxStyle: {
            overflow: 'hidden',
            display: 'inline-block',
            width: '3em',
            height: '1.5em',
            'vertical-align': '-0.5em',
            //border: '1px solid #444444',
            margin: '0 0.5em 0.2em 0'
        },
        colorFillStyle: {
            width: '0',
            height: '0',
            'border-width': '100px',
            'border-style': 'solid',
            'border-color': '#ffffff'
        },
        labelStyle: {},
        histogramBarStyle: {
            'display': 'inline-block',
            height: '1.1em',
            'font-size': '0.8em',
            'vertical-align': '0.1em',
            color: '#999999',
            'background-color': '#dddddd'
        },
        histogramBarWidth: 1
    };
    
    options = mapmap.extend(DEFAULTS, options);
    
    function parameterFunction(param, func) {
        if (dd.isFunction(param)) return param;
        return func(param);
    }
    
    options.histogramBarWidth = parameterFunction(options.histogramBarWidth, function(param) {
        return function(count) {
            var width = count * param;
            // always round up small values to make sure at least 1px wide
            if (width > 0 && width < 1) width = 1;
            return width;
        };
    });
    
    return function(attribute, reprAttribute, metadata, classes, undefinedClass) {
    
        var legend = this._elements.parent.select('.' + options.legendClassName);
        if (legend.empty()) {
            legend = this._elements.parent.append('div')
                .attr('class',options.legendClassName);
        }
        
        legend.style(options.legendStyle);
        
        // TODO: attribute may be a function, so we cannot easily generate a label for it
        var title = legend.selectAll('h3')
            .data([valueOrCall(metadata.label, attribute) || (dd.isString(attribute) ? attribute : '')]);
            
        title.enter().append('h3');
        
        title.html(function(d){return d;});
        
        // we need highest values first for numeric scales
        if (metadata.scale != 'ordinal') {
            classes.reverse();
        }
        if (undefinedClass) {
            classes.push(undefinedClass);
        }
        
        var cells = legend.selectAll('div.legendCell')
            .data(classes);
        
        cells.exit().remove();
        
        var newcells = cells.enter()
            .append('div')
            .style(options.cellStyle);
        
        cells
            .attr('class', 'legendCell')
            .each(function(d) {
                if (d.class) {
                    d3.select(this).classed(d.class, true);
                }
            });
        
        function updateRepresentations(newcells, cells, options) {
        
            newcells = newcells.append('svg')
                .attr('class', 'legendColor')
                .style(options.colorBoxStyle);
                
            if (reprAttribute == 'fill') {
                newcells.append('rect')
                    .attr({
                        width: 100,
                        height: 100
                    })
                    .attr({
                        'fill': function(d) {return d.representation;}
                    });
                    
                cells.select('.legendColor rect')
                    .transition()
                    .attr({
                        'fill': function(d) {return d.representation;}
                    });
            }
            else if (reprAttribute == 'stroke') {
            
                // construct attributes object from reprAttribute variable
                var strokeAttrs = {};
                strokeAttrs[reprAttribute] = function(d) {return d.representation;};
                
                newcells.append('line')
                    .attr({
                        y1: 10,
                        y2: 10,
                        x1: 5,
                        x2: 100,
                        stroke: '#000000',
                        'stroke-width': 3
                    })
                    .attr(strokeAttrs);
                    
                cells.select('.legendColor rect')
                    .transition()
                    .attr(strokeAttrs);

            }
        }
        
        updateRepresentations(newcells, cells, options);
        
        newcells.append('span')
            .attr('class','legendLabel')
            .style(options.labelStyle);

        cells.attr('data-count',function(d) {return d.count();});
        
        cells.select('.legendLabel')
            .text(function(d) {
                var formatter;
                // TODO: we need some way of finding out whether we have intervals or values from the metadata
                // to cache the label formatter
                if (d.valueRange) {
                    formatter = metadata.getRangeFormatter();
                    return formatter(d.valueRange[0], d.valueRange[1], d.includeLower, d.includeUpper);
                }
                if (d.value) {
                    formatter = metadata.getFormatter();
                    return formatter(d.value);
                }
                return metadata.undefinedLabel;
            });
            
        if (options.histogram) {

            newcells.append('span')
                .attr('class', 'legendHistogramBar')
                .style(options.histogramBarStyle);

            cells.select('.legendHistogramBar').transition()
                .style('width', function(d){
                    var width = options.histogramBarWidth(d.count());
                    // string returned? -> use unchanged
                    if (width.length && width.indexOf('px') == width.lenght - 2) {
                        return width;
                    }
                    return Math.round(width) + 'px';
                })
                .text(function(d) { return ' ' + d.count(); });
        }
        
        if (options.callback) options.callback();
    }
}

mapmap.legend.svg = function(range, labelFormat, histogram, options) {

    var DEFAULTS = {
        cellSpacing: 5,
        layout: 'vertical',
        histogram: false,
        histogramLength: 80,
        containerAttributes: {
            transform: 'translate(20,10)'
        },
        backgroundAttributes: {
            fill: '#fff',
            'fill-opacity': 0.9,
            x: -10,
            y: -10,
            width: 220
        },
        cellAttributes: {
        },
        colorAttributes: {
            'width': 40,
            'height': 18,
            'stroke': '#000',
            'stroke-width': '0.5px',
            'fill': '#fff'  // this will be used before first transition
        },
        textAttributes: {
            'font-size': 10,
            'pointer-events': 'none',
            dy: 12
        },
        histogramBarAttributes: {
            width: 0,
            x: 140,
            y: 4,
            height: 10,
            fill: '#000',
            'fill-opacity': 0.2
        }
    };

    // TODO: we can't integrate thes into settings because it references settings attributes
    var layouts = {
        'horizontal': {
            cellAttributes: {
                transform: function(d,i){ return 'translate(' + i * (options.colorAttributes.width + options.cellSpacing) + ',0)';}
            },
            textAttributes: {
                y: function() { return options.colorAttributes.height + options.cellSpacing;}
                
            }
        },
        'vertical': {
            cellAttributes: {
                transform: function(d,i){ return 'translate(0,' + i * (options.colorAttributes.height + options.cellSpacing) + ')';}
            },
            textAttributes: {
                x: function() { return options.colorAttributes.width + options.cellSpacing;},
            }
        }
    };

    var layout = layouts[options.layout];
    
    if (options.layout == 'vertical') {
        range.reverse();
    }
    
    this._elements.legend.attr(options.containerAttributes);
 
    var bg = this._elements.legend.selectAll('rect.background')
        .data([1]);
    
    bg.enter()
        .append('rect')
        .attr('class', 'background')
        .attr(options.backgroundAttributes);
    bg.transition().attr('height', histogram.length * (options.colorAttributes.height + options.cellSpacing) + (20 - options.cellSpacing));    
        
    var cells = this._elements.legend.selectAll('g.cell')
        .data(range);
    
    cells.exit().remove();
    
    var newcells = cells.enter()
        .append('g')
        .attr('class', 'cell')
        .attr(options.cellAttributes)
        .attr(layout.cellAttributes);
        
    newcells.append('rect')
        .attr('class', 'color')
        .attr(options.colorAttributes)
        .attr(layout.colorAttributes);
                
    if (options.histogram) {

        newcells.append('rect')
            .attr("class", "bar")
            .attr(options.histogramBarAttributes);

        cells.select('.bar').transition()
            .attr("width", function(d,i){
                return histogram[histogram.length-i-1].y * options.histogramLength;
            });
    }

    newcells.append('text')
        .attr(options.textAttributes)
        .attr(layout.textAttributes);
    
    cells.select('.color').transition()
        .attr('fill', function(d) {return d;});
    
    cells.select('text')
        .text(labelFormat);
}

mapmap.prototype.projection = function(projection) {
    if (projection === undefined) return this._projection;
    this._projection = projection;
    return this;
}

mapmap.prototype.extent = function(selection, options) {

    var map = this;
    
    this.selected_extent = selection || this.selected;
    
    this._promise.geometry.then(function(topo) {
        // TODO: getRepresentations() depends on <path>s being drawn, but we want to 
        // be able to call extent() before draw() to set up projection
        // solution: manage merged geometry + data independent from SVG representation
        var geom = map.getRepresentations(map.selected_extent);
        var all = {
            'type': 'FeatureCollection',
            'features': []
        };
        geom.each(function(d){
            all.features.push(d);
        });

        map._extent(all, options);
    });
    return this;
};

mapmap.prototype._extent = function(geom, options) {

    options = dd.merge({
        fillFactor: 0.9
    }, options);
    
    // convert/merge topoJSON
    if (geom.type && geom.type == 'Topology') {
        // we need to merge all named features
        var names = Object.keys(geom.objects);
        var all = [];
        for (var i=0; i<names.length; i++) {
            all = all.concat(topojson.feature(geom, geom.objects[names[i]]).features);
        }
        geom = all;
    }
    if (dd.isArray(geom)) {
        var all = {
            'type': 'FeatureCollection',
            'features': geom
        };
        geom = all;
    }
    
    // reset scale to be able to calculate extents of geometry
    this._projection.scale(1).translate([0, 0]);
    var pathGenerator = d3.geo.path().projection(this._projection);
    var bounds = pathGenerator.bounds(geom);
    // use absolute values, as east does not always have to be right of west!
    bounds.height = Math.abs(bounds[1][1] - bounds[0][1]);
    bounds.width = Math.abs(bounds[1][0] - bounds[0][0]);
    
    // if we are not centered in midpoint, calculate "padding factor"
    var fac_x = 1 - Math.abs(0.5 - center.x) * 2,
        fac_y = 1 - Math.abs(0.5 - center.y) * 2;
        
    var size = this.size();
    var scale = options.fillFactor / Math.max(bounds.width / size.width / fac_x, bounds.height / size.height / fac_y);
    
    this._projection
        .scale(scale)
        .translate([(size.width - scale * (bounds[1][0] + bounds[0][0]))/ 2, (size.height - scale * (bounds[1][1] + bounds[0][1]))/ 2]);  
    
    // apply new projection to existing paths
    this._elements.map.selectAll("path")
        .attr("d", pathGenerator);        
    
};

function keyOrCallback(val) {
    if (typeof val != 'function') {
        return function(d){
            return d[val];
        };
    }
    return val;
}

module.exports = mapmap;
},{"datadata":1}]},{},[3])(3)
});
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcGFjay9fcHJlbHVkZS5qcyIsIi4uLy4uLy4uL2RhdGFkYXRhL3NyYy9pbmRleC5qcyIsIi4uL2Jyb3dzZXJpZnkvbGliL19lbXB0eS5qcyIsInNyYy9pbmRleC5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xvQkE7O0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiLyohIGRhdGFkYXRhLmpzIMKpIDIwMTQtMjAxNSBGbG9yaWFuIExlZGVybWFubiBcclxuXHJcblRoaXMgcHJvZ3JhbSBpcyBmcmVlIHNvZnR3YXJlOiB5b3UgY2FuIHJlZGlzdHJpYnV0ZSBpdCBhbmQvb3IgbW9kaWZ5XHJcbml0IHVuZGVyIHRoZSB0ZXJtcyBvZiB0aGUgR05VIEFmZmVybyBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlIGFzIHB1Ymxpc2hlZCBieVxyXG50aGUgRnJlZSBTb2Z0d2FyZSBGb3VuZGF0aW9uLCBlaXRoZXIgdmVyc2lvbiAzIG9mIHRoZSBMaWNlbnNlLCBvclxyXG4oYXQgeW91ciBvcHRpb24pIGFueSBsYXRlciB2ZXJzaW9uLlxyXG5cclxuVGhpcyBwcm9ncmFtIGlzIGRpc3RyaWJ1dGVkIGluIHRoZSBob3BlIHRoYXQgaXQgd2lsbCBiZSB1c2VmdWwsXHJcbmJ1dCBXSVRIT1VUIEFOWSBXQVJSQU5UWTsgd2l0aG91dCBldmVuIHRoZSBpbXBsaWVkIHdhcnJhbnR5IG9mXHJcbk1FUkNIQU5UQUJJTElUWSBvciBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRS4gIFNlZSB0aGVcclxuR05VIEFmZmVybyBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlIGZvciBtb3JlIGRldGFpbHMuXHJcblxyXG5Zb3Ugc2hvdWxkIGhhdmUgcmVjZWl2ZWQgYSBjb3B5IG9mIHRoZSBHTlUgQWZmZXJvIEdlbmVyYWwgUHVibGljIExpY2Vuc2VcclxuYWxvbmcgd2l0aCB0aGlzIHByb2dyYW0uICBJZiBub3QsIHNlZSA8aHR0cDovL3d3dy5nbnUub3JnL2xpY2Vuc2VzLz4uXHJcbiovXHJcblxyXG4ndXNlIHN0cmljdCc7XHJcblxyXG4vLyB0ZXN0IHdoZXRoZXIgaW4gYSBicm93c2VyIGVudmlyb25tZW50XHJcbmlmICh0eXBlb2Ygd2luZG93ID09PSAndW5kZWZpbmVkJykge1xyXG4gICAgLy8gbm9kZVxyXG4gICAgdmFyIGQzZHN2ID0gcmVxdWlyZSgnZDMtZHN2Jyk7XHJcbiAgICB2YXIgZnMgPSByZXF1aXJlKCdmcycpO1xyXG4gICAgXHJcbiAgICB2YXIgZmlsZXBhcnNlciA9IGZ1bmN0aW9uKGZ1bmMpIHtcclxuICAgICAgICByZXR1cm4gZnVuY3Rpb24ocGF0aCwgcm93LCBjYWxsYmFjaykge1xyXG4gICAgICAgICAgICBpZiAoZGQuaXNVbmRlZmluZWQoY2FsbGJhY2spKSB7XHJcbiAgICAgICAgICAgICAgICBjYWxsYmFjayA9IHJvdztcclxuICAgICAgICAgICAgICAgIHJvdyA9IG51bGw7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZnMucmVhZEZpbGUocGF0aCwgJ3V0ZjgnLCBmdW5jdGlvbihlcnJvciwgZGF0YSkge1xyXG4gICAgICAgICAgICAgICAgaWYgKGVycm9yKSByZXR1cm4gY2FsbGJhY2soZXJyb3IpO1xyXG4gICAgICAgICAgICAgICAgZGF0YSA9IGZ1bmMoZGF0YSwgcm93KTtcclxuICAgICAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsZGF0YSk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH07XHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICB2YXIgZDMgPSB7XHJcbiAgICAgICAgY3N2OiBmaWxlcGFyc2VyKGQzZHN2LmNzdi5wYXJzZSksXHJcbiAgICAgICAgdHN2OiBmaWxlcGFyc2VyKGQzZHN2LnRzdi5wYXJzZSksXHJcbiAgICAgICAganNvbjogZmlsZXBhcnNlcihKU09OLnBhcnNlKVxyXG4gICAgfTtcclxuXHJcbn0gZWxzZSB7XHJcbiAgICAvLyBicm93c2VyXHJcbiAgICAvLyB3ZSBleHBlY3QgZ2xvYmFsIGQzIHRvIGJlIGF2YWlsYWJsZVxyXG4gICAgdmFyIGQzID0gd2luZG93LmQzO1xyXG59XHJcblxyXG5cclxuZnVuY3Rpb24gcm93RmlsZUhhbmRsZXIobG9hZGVyKSB7XHJcbiAgICAvLyBUT0RPOiBmaWxlIGhhbmRsZXIgQVBJIHNob3VsZCBub3QgbmVlZCB0byBiZSBwYXNzZWQgbWFwLCByZWR1Y2UgZnVuY3Rpb25zIGJ1dCBiZSB3cmFwcGVkIGV4dGVybmFsbHlcclxuICAgIHJldHVybiBmdW5jdGlvbihwYXRoLCBtYXAsIHJlZHVjZSwgb3B0aW9ucykge1xyXG4gICAgXHJcbiAgICAgICAgb3B0aW9ucyA9IGRkLm1lcmdlKHtcclxuICAgICAgICAgICAgLy8gZGVmYXVsdCBhY2Nlc3NvciBmdW5jdGlvbiB0cmllcyB0byBjb252ZXJ0IG51bWJlci1saWtlIHN0cmluZ3MgdG8gbnVtYmVyc1xyXG4gICAgICAgICAgICBhY2Nlc3NvcjogZnVuY3Rpb24oZCkge1xyXG4gICAgICAgICAgICAgICAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhkKTtcclxuICAgICAgICAgICAgICAgIGZvciAodmFyIGk9MDsgaTxrZXlzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdmFyIGtleSA9IGtleXNbaV0sXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbCA9IGRba2V5XTtcclxuICAgICAgICAgICAgICAgICAgICAvLyBDU1YgZG9lc24ndCBzdXBwb3J0IHNwZWNpZmljYXRpb24gb2YgbnVsbCB2YWx1ZXNcclxuICAgICAgICAgICAgICAgICAgICAvLyBpbnRlcnByZXQgZW1wdHkgZmllbGQgdmFsdWVzIGFzIG1pc3NpbmdcclxuICAgICAgICAgICAgICAgICAgICBpZiAodmFsID09PSBcIlwiKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGRba2V5XSA9IG51bGw7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGVsc2UgaWYgKGRkLmlzTnVtZXJpYyh2YWwpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHVuYXJ5ICsgY29udmVydHMgYm90aCBpbnRzIGFuZCBmbG9hdHMgY29ycmVjdGx5XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGRba2V5XSA9ICt2YWw7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGQ7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9LCBvcHRpb25zKTtcclxuICAgICAgICBcclxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KSB7XHJcbiAgICAgICAgICAgIGxvYWRlcihwYXRoLCBvcHRpb25zLmFjY2Vzc29yLFxyXG4gICAgICAgICAgICAgICAgZnVuY3Rpb24oZXJyb3IsIGRhdGEpIHtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoZXJyb3IpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmVqZWN0KGVycm9yKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICByZXNvbHZlKGRkLm1hcHJlZHVjZShkYXRhLCBtYXAsIHJlZHVjZSkpOyAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgfSk7IFxyXG4gICAgfTtcclxufVxyXG5cclxuZnVuY3Rpb24ganNvbkZpbGVIYW5kbGVyKHBhdGgsIG1hcCwgcmVkdWNlKSB7XHJcbiAgICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KSB7XHJcbiAgICAgICAgZDMuanNvbihwYXRoLCBmdW5jdGlvbihlcnJvciwgZGF0YSkge1xyXG4gICAgICAgICAgICBpZiAoZXJyb3IpIHtcclxuICAgICAgICAgICAgICAgIHJlamVjdChlcnJvcik7XHJcbiAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgaWYgKGRkLmlzQXJyYXkoZGF0YSkpIHtcclxuICAgICAgICAgICAgICAgIHJlc29sdmUoZGQubWFwcmVkdWNlKGRhdGEsIG1hcCwgcmVkdWNlKSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAvLyBvYmplY3QgLSB0cmVhdCBlbnRyaWVzIGFzIGtleXMgYnkgZGVmYXVsdFxyXG4gICAgICAgICAgICAgICAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhkYXRhKTtcclxuICAgICAgICAgICAgICAgIHZhciBtYXBfZnVuYztcclxuICAgICAgICAgICAgICAgIGlmICghbWFwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gdXNlIGtleXMgYXMgZGF0YSB0byBlbWl0IGtleS9kYXRhIHBhaXJzIGluIG1hcCBzdGVwIVxyXG4gICAgICAgICAgICAgICAgICAgIG1hcF9mdW5jID0gZGQubWFwLmRpY3QoZGF0YSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICBtYXBfZnVuYyA9IGZ1bmN0aW9uKGssIGVtaXQpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gcHV0IG9yaWdpbmFsIGtleSBpbnRvIG9iamVjdFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgdiA9IGRhdGFba107XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHYuX19rZXlfXyA9IGs7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGNhbGwgdXNlci1wcm92aWRlZCBtYXAgZnVudGlvbiB3aXRoIG9iamVjdFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBtYXAodiwgZW1pdCk7XHJcbiAgICAgICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHJlc29sdmUoZGQubWFwcmVkdWNlKGtleXMsIG1hcF9mdW5jLCByZWR1Y2UpKTtcclxuICAgICAgICAgICAgfSAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgfSk7XHJcbiAgICB9KTtcclxufVxyXG5cclxudmFyIGZpbGVIYW5kbGVycyA9IHtcclxuICAgICdjc3YnOiAgcm93RmlsZUhhbmRsZXIoZDMuY3N2KSxcclxuICAgICd0c3YnOiAgcm93RmlsZUhhbmRsZXIoZDMudHN2KSxcclxuICAgICdqc29uJzoganNvbkZpbGVIYW5kbGVyXHJcbn07XHJcblxyXG52YXIgZ2V0RmlsZUhhbmRsZXIgPSBmdW5jdGlvbihwYXRoT3JFeHQpIHtcclxuICAgIC8vIGd1ZXNzIHR5cGVcclxuICAgIHZhciBleHQgPSBwYXRoT3JFeHQuc3BsaXQoJy4nKS5wb3AoKS50b0xvd2VyQ2FzZSgpO1xyXG4gICAgcmV0dXJuIGZpbGVIYW5kbGVyc1tleHRdIHx8IG51bGw7XHJcbn07XHJcblxyXG52YXIgcmVnaXN0ZXJGaWxlSGFuZGxlciA9IGZ1bmN0aW9uKGV4dCwgaGFuZGxlcikge1xyXG4gICAgZmlsZUhhbmRsZXJzW2V4dF0gPSBoYW5kbGVyO1xyXG59O1xyXG5cclxuLy8gVE9ETzogcmVnaXN0ZXIgLnRvcG9qc29uLCAuZ2VvanNvbiBpbiBtYXBtYXAuanNcclxuXHJcbi8qKlxyXG5EYXRhZGF0YSAtIGEgbW9kdWxlIGZvciBsb2FkaW5nIGFuZCBwcm9jZXNzaW5nIGRhdGEuXHJcbllvdSBjYW4gY2FsbCB0aGUgbW9kdWxlIGFzIGEgZnVuY3Rpb24gdG8gY3JlYXRlIGEgcHJvbWlzZSBmb3IgZGF0YSBmcm9tIGEgVVJMLCBGdW5jdGlvbiBvciBBcnJheS4gXHJcblJldHVybnMgYSBwcm9taXNlIGZvciBkYXRhIGZvciBldmVyeXRoaW5nLlxyXG5AcGFyYW0geyhzdHJpbmd8ZnVuY3Rpb258QXJyYXkpfSBzcGVjIC0gQSBTdHJpbmcgKFVSTCksIEZ1bmN0aW9uIG9yIEFycmF5IG9mIGRhdGEuXHJcbkBwYXJhbSB7KGZ1bmN0aW9ufHN0cmluZyl9IFttYXA9e0BsaW5rIGRhdGFkYXRhLm1hcC5kaWN0fV0gIC0gVGhlIG1hcCBmdW5jdGlvbiBmb3IgbWFwL3JlZHVjZS5cclxuQHBhcmFtIHsoc3RyaW5nKX0gW3JlZHVjZT1kYXRhZGF0YS5lbWl0Lmxhc3RdIC0gVGhlIHJlZHVjZSBmdW5jdGlvbiBmb3IgbWFwL3JlZHVjZS5cclxuQGV4cG9ydHMgbW9kdWxlOmRhdGFkYXRhXHJcbiovXHJcbnZhciBkZCA9IGZ1bmN0aW9uKHNwZWMsIG1hcCwgcmVkdWNlLCBvcHRpb25zKSB7XHJcblxyXG4gICAgLy8gb3B0aW9uc1xyXG4gICAgLy8gdHlwZTogb3ZlcnJpZGUgZmlsZSBleHRlbnNpb24sIGUuZy4gZm9yIEFQSSB1cmxzIChlLmcuICdjc3YnKVxyXG4gICAgLy8gZmlsZUhhbmRsZXI6IG1hbnVhbGx5IHNwZWNpZnkgZmlsZSBoYW5kbGVyIHRvIGJlIHVzZWQgdG8gbG9hZCAmIHBhcnNlIGZpbGVcclxuICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xyXG5cclxuICAgIGlmIChzcGVjID09IG51bGwpIHRocm93IG5ldyBFcnJvcihcImRhdGFkYXRhLmpzOiBObyBkYXRhIHNwZWNpZmljYXRpb24uXCIpO1xyXG4gICAgICAgIFxyXG4gICAgaWYgKG1hcCAmJiAhZGQuaXNGdW5jdGlvbihtYXApKSB7XHJcbiAgICAgICAgLy8gbWFwIGlzIHN0cmluZyAtPiBtYXAgdG8gYXR0cmlidXRlIHZhbHVlXHJcbiAgICAgICAgbWFwID0gZGQubWFwLmtleShtYXApO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICBpZiAoZGQuaXNTdHJpbmcoc3BlYykpIHtcclxuICAgICAgICAvLyBjb25zaWRlciBzcGVjIHRvIGJlIGEgVVJML2ZpbGUgdG8gbG9hZFxyXG4gICAgICAgIHZhciBoYW5kbGVyID0gb3B0aW9ucy5maWxlSGFuZGxlciB8fCBnZXRGaWxlSGFuZGxlcihvcHRpb25zLnR5cGUgfHwgc3BlYyk7XHJcbiAgICAgICAgaWYgKGhhbmRsZXIpIHtcclxuICAgICAgICAgICAgcmV0dXJuIGhhbmRsZXIoc3BlYywgbWFwLCByZWR1Y2UsIG9wdGlvbnMpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiZGF0YWRhdGEuanM6IFVua25vd24gZmlsZSB0eXBlIGZvcjogXCIgKyBzcGVjKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBpZiAoZGQuaXNBcnJheShzcGVjKSkge1xyXG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3QpIHtcclxuICAgICAgICAgICAgcmVzb2x2ZShkZC5tYXByZWR1Y2Uoc3BlYywgbWFwLCByZWR1Y2UpKTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuICAgIHRocm93IG5ldyBFcnJvcihcImRhdGFkYXRhLmpzOiBVbmtub3duIGRhdGEgc3BlY2lmaWNhdGlvbi5cIik7XHJcbn07XHJcblxyXG4vLyBleHBvc2UgcmVnaXN0cmF0aW9uIG1ldGhvZCAmIHJvd0ZpbGVIYW5kbGVyIGhlbHBlclxyXG5kZC5yZWdpc3RlckZpbGVIYW5kbGVyID0gcmVnaXN0ZXJGaWxlSGFuZGxlcjtcclxuZGQucm93RmlsZUhhbmRsZXIgPSByb3dGaWxlSGFuZGxlcjtcclxuXHJcbi8vIHNpbXBsZSBsb2FkIGZ1bmN0aW9uLCByZXR1cm5zIGEgcHJvbWlzZSBmb3IgZGF0YSB3aXRob3V0IG1hcC9yZWR1Y2UtaW5nXHJcbi8vIERPIE5PVCBVU0UgLSBwcmVzZW50IG9ubHkgZm9yIG1hcG1hcC5qcyBsZWdhY3kgcmVhc29uc1xyXG5kZC5sb2FkID0gZnVuY3Rpb24oc3BlYywga2V5KSB7XHJcbiAgICBpZiAoc3BlYy50aGVuICYmIHR5cGVvZiBzcGVjLnRoZW4gPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICAvLyBhbHJlYWR5IGEgdGhlbmFibGUgLyBwcm9taXNlXHJcbiAgICAgICAgcmV0dXJuIHNwZWM7XHJcbiAgICB9XHJcbiAgICBlbHNlIGlmIChkZC5pc1N0cmluZyhzcGVjKSkge1xyXG4gICAgICAgIC8vIGNvbnNpZGVyIHNwZWMgdG8gYmUgYSBVUkwgdG8gbG9hZFxyXG4gICAgICAgIC8vIGd1ZXNzIHR5cGVcclxuICAgICAgICB2YXIgZXh0ID0gc3BlYy5zcGxpdCgnLicpLnBvcCgpO1xyXG4gICAgICAgIGlmIChleHQgPT0gJ2pzb24nIHx8IGV4dCA9PSAndG9wb2pzb24nIHx8IGV4dCA9PSAnZ2VvanNvbicpIHtcclxuICAgICAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCkge1xyXG4gICAgICAgICAgICAgICAgZDMuanNvbihzcGVjLCBmdW5jdGlvbihlcnJvciwgZGF0YSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChlcnJvcikge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZWplY3QoZXJyb3IpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoZGF0YSk7XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXCJVbmtub3duIGV4dGVuc2lvbjogXCIgKyBleHQpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufTtcclxuXHJcblxyXG4vLyBUeXBlIGNoZWNraW5nXHJcbi8qKlxyXG5SZXR1cm4gdHJ1ZSBpZiBhcmd1bWVudCBpcyBhIHN0cmluZy5cclxuQHBhcmFtIHthbnl9IHZhbCAtIFRoZSB2YWx1ZSB0byBjaGVjay5cclxuKi9cclxuZGQuaXNTdHJpbmcgPSBmdW5jdGlvbiAodmFsKSB7XHJcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh2YWwpID09ICdbb2JqZWN0IFN0cmluZ10nO1xyXG59O1xyXG4vKipcclxuUmV0dXJuIHRydWUgaWYgYXJndW1lbnQgaXMgYSBmdW5jdGlvbi5cclxuQHBhcmFtIHthbnl9IHZhbCAtIFRoZSB2YWx1ZSB0byBjaGVjay5cclxuKi9cclxuZGQuaXNGdW5jdGlvbiA9IGZ1bmN0aW9uKG9iaikge1xyXG4gICAgcmV0dXJuICh0eXBlb2Ygb2JqID09PSAnZnVuY3Rpb24nKTtcclxufTtcclxuLyoqXHJcblJldHVybiB0cnVlIGlmIGFyZ3VtZW50IGlzIGFuIEFycmF5LlxyXG5AcGFyYW0ge2FueX0gdmFsIC0gVGhlIHZhbHVlIHRvIGNoZWNrLlxyXG4qL1xyXG5kZC5pc0FycmF5ID0gZnVuY3Rpb24ob2JqKSB7XHJcbiAgICByZXR1cm4gKG9iaiBpbnN0YW5jZW9mIEFycmF5KTtcclxufTtcclxuLyoqXHJcblJldHVybiB0cnVlIGlmIGFyZ3VtZW50IGlzIGFuIE9iamVjdCwgYnV0IG5vdCBhbiBBcnJheSwgU3RyaW5nIG9yIGFueXRoaW5nIGNyZWF0ZWQgd2l0aCBhIGN1c3RvbSBjb25zdHJ1Y3Rvci5cclxuQHBhcmFtIHthbnl9IHZhbCAtIFRoZSB2YWx1ZSB0byBjaGVjay5cclxuKi9cclxuZGQuaXNEaWN0aW9uYXJ5ID0gZnVuY3Rpb24ob2JqKSB7XHJcbiAgICByZXR1cm4gKG9iaiAmJiBvYmouY29uc3RydWN0b3IgJiYgb2JqLmNvbnN0cnVjdG9yID09PSBPYmplY3QpO1xyXG59O1xyXG4vKipcclxuUmV0dXJuIHRydWUgaWYgYXJndW1lbnQgaXMgdW5kZWZpbmVkLlxyXG5AcGFyYW0ge2FueX0gdmFsIC0gVGhlIHZhbHVlIHRvIGNoZWNrLlxyXG4qL1xyXG5kZC5pc1VuZGVmaW5lZCA9IGZ1bmN0aW9uKG9iaikge1xyXG4gICAgcmV0dXJuICh0eXBlb2Ygb2JqID09ICd1bmRlZmluZWQnKTtcclxufTtcclxuLyoqXHJcblJldHVybiB0cnVlIGlmIGFyZ3VtZW50IGlzIGEgbnVtYmVyIG9yIGEgc3RyaW5nIHRoYXQgc3RyaWN0bHkgbG9va3MgbGlrZSBhIG51bWJlci5cclxuVGhpcyBtZXRob2QgaXMgc3RyaWN0ZXIgdGhhbiArdmFsIG9yIHBhcnNlSW50KHZhbCkgYXMgaXQgZG9lc24ndCB2YWxpZGF0ZSB0aGUgZW1wdHlcclxuc3RyaW5nIG9yIHN0cmluZ3MgY29udGluaW5nIGFueSBub24tbnVtZXJpYyBjaGFyYWN0ZXJzLiBcclxuQHBhcmFtIHthbnl9IHZhbCAtIFRoZSB2YWx1ZSB0byBjaGVjay5cclxuKi9cclxuZGQuaXNOdW1lcmljID0gZnVuY3Rpb24odmFsKSB7XHJcbiAgICAvLyBjaGVjayBpZiBzdHJpbmcgbG9va3MgbGlrZSBhIG51bWJlclxyXG4gICAgLy8gK1wiXCIgPT4gMFxyXG4gICAgLy8gcGFyc2VJbnQoXCJcIikgPT4gTmFOXHJcbiAgICAvLyBwYXJzZUludChcIjEyM09LXCIpID0+IDEyM1xyXG4gICAgLy8gK1wiMTIzT0tcIiA9PiBOYU5cclxuICAgIC8vIHNvIHdlIG5lZWQgdG8gcGFzcyBib3RoIHRvIGJlIHN0cmljdFxyXG4gICAgcmV0dXJuICFpc05hTigrdmFsKSAmJiAhaXNOYU4ocGFyc2VGbG9hdCh2YWwpKTtcclxufVxyXG5cclxuLy8gVHlwZSBjb252ZXJzaW9uIC8gdXRpbGl0aWVzXHJcbi8qKlxyXG5JZiB0aGUgYXJndW1lbnQgaXMgYWxyZWFkeSBhbiBBcnJheSwgcmV0dXJuIGEgY29weSBvZiB0aGUgQXJyYXkuXHJcbkVsc2UsIHJldHVybiBhIHNpbmdsZS1lbGVtZW50IEFycmF5IGNvbnRhaW5pbmcgdGhlIGFyZ3VtZW50LlxyXG4qL1xyXG5kZC50b0FycmF5ID0gZnVuY3Rpb24odmFsKSB7XHJcbiAgICBpZiAoIXZhbCkgcmV0dXJuIFtdO1xyXG4gICAgLy8gcmV0dXJuIGEgY29weSBpZiBhcmVhZHkgYXJyYXksIGVsc2Ugc2luZ2xlLWVsZW1lbnQgYXJyYXlcclxuICAgIHJldHVybiBkZC5pc0FycmF5KHZhbCkgPyB2YWwuc2xpY2UoKSA6IFt2YWxdO1xyXG59O1xyXG5cclxuLyoqXHJcblNoYWxsb3cgb2JqZWN0IG1lcmdpbmcsIG1haW5seSBmb3Igb3B0aW9ucy4gUmV0dXJucyBhIG5ldyBvYmplY3QuXHJcbiovXHJcbmRkLm1lcmdlID0gZnVuY3Rpb24oKSB7XHJcbiAgICB2YXIgb2JqID0ge307XHJcblxyXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcmd1bWVudHMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICB2YXIgc3JjID0gYXJndW1lbnRzW2ldO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGZvciAodmFyIGtleSBpbiBzcmMpIHtcclxuICAgICAgICAgICAgaWYgKHNyYy5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XHJcbiAgICAgICAgICAgICAgICBvYmpba2V5XSA9IHNyY1trZXldO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBvYmo7XHJcbn07XHJcblxyXG4vKipcclxuUmV0dXJuIGFuIHtAbGluayBtb2R1bGU6ZGF0YWRhdGEuT3JkZXJlZEhhc2h8T3JkZXJlZEhhc2h9IG9iamVjdC5cclxuQGV4cG9ydHMgbW9kdWxlOmRhdGFkYXRhLk9yZGVyZWRIYXNoXHJcbiovXHJcbmRkLk9yZGVyZWRIYXNoID0gZnVuY3Rpb24oKSB7XHJcbiAgICAvLyBvcmRlcmVkIGhhc2ggaW1wbGVtZW50YXRpb25cclxuICAgIHZhciBrZXlzID0gW107XHJcbiAgICB2YXIgdmFscyA9IHt9O1xyXG4gICAgXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIC8qKlxyXG4gICAgICAgIEFkZCBhIGtleS92YWx1ZSBwYWlyIHRvIHRoZSBlbmQgb2YgdGhlIE9yZGVyZWRIYXNoLlxyXG4gICAgICAgIEBwYXJhbSB7U3RyaW5nfSBrIC0gS2V5XHJcbiAgICAgICAgQHBhcmFtIHYgLSBWYWx1ZVxyXG4gICAgICAgICovXHJcbiAgICAgICAgcHVzaDogZnVuY3Rpb24oayx2KSB7XHJcbiAgICAgICAgICAgIGlmICghdmFsc1trXSkga2V5cy5wdXNoKGspO1xyXG4gICAgICAgICAgICB2YWxzW2tdID0gdjtcclxuICAgICAgICB9LFxyXG4gICAgICAgIC8qKlxyXG4gICAgICAgIEluc2VydCBhIGtleS92YWx1ZSBwYWlyIGF0IHRoZSBzcGVjaWZpZWQgcG9zaXRpb24uXHJcbiAgICAgICAgQHBhcmFtIHtOdW1iZXJ9IGkgLSBJbmRleCB0byBpbnNlcnQgdmFsdWUgYXRcclxuICAgICAgICBAcGFyYW0ge1N0cmluZ30gayAtIEtleVxyXG4gICAgICAgIEBwYXJhbSB2IC0gVmFsdWVcclxuICAgICAgICAqL1xyXG4gICAgICAgIGluc2VydDogZnVuY3Rpb24oaSxrLHYpIHtcclxuICAgICAgICAgICAgaWYgKCF2YWxzW2tdKSB7XHJcbiAgICAgICAgICAgICAgICBrZXlzLnNwbGljZShpLDAsayk7XHJcbiAgICAgICAgICAgICAgICB2YWxzW2tdID0gdjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgLyoqXHJcbiAgICAgICAgUmV0dXJuIHRoZSB2YWx1ZSBmb3Igc3BlY2lmaWVkIGtleS5cclxuICAgICAgICBAcGFyYW0ge1N0cmluZ30gayAtIEtleVxyXG4gICAgICAgICovXHJcbiAgICAgICAgZ2V0OiBmdW5jdGlvbihrKSB7XHJcbiAgICAgICAgICAgIC8vIHN0cmluZyAtPiBrZXlcclxuICAgICAgICAgICAgcmV0dXJuIHZhbHNba107XHJcbiAgICAgICAgfSxcclxuICAgICAgICAvKipcclxuICAgICAgICBSZXR1cm4gdGhlIHZhbHVlIGF0IHNwZWNpZmllZCBpbmRleCBwb3NpdGlvbi5cclxuICAgICAgICBAcGFyYW0ge1N0cmluZ30gaSAtIEluZGV4XHJcbiAgICAgICAgKi9cclxuICAgICAgICBhdDogZnVuY3Rpb24oaSkge1xyXG4gICAgICAgICAgICAvLyBudW1iZXIgLT4gbnRoIG9iamVjdFxyXG4gICAgICAgICAgICByZXR1cm4gdmFsc1trZXlzW2ldXTtcclxuICAgICAgICB9LFxyXG4gICAgICAgIGxlbmd0aDogZnVuY3Rpb24oKXtyZXR1cm4ga2V5cy5sZW5ndGg7fSxcclxuICAgICAgICBrZXlzOiBmdW5jdGlvbigpe3JldHVybiBrZXlzO30sXHJcbiAgICAgICAga2V5OiBmdW5jdGlvbihpKSB7cmV0dXJuIGtleXNbaV07fSxcclxuICAgICAgICB2YWx1ZXM6IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgICAgICByZXR1cm4ga2V5cy5tYXAoZnVuY3Rpb24oa2V5KXtyZXR1cm4gdmFsc1trZXldO30pO1xyXG4gICAgICAgIH0sXHJcbiAgICAgICAgbWFwOiBmdW5jdGlvbihmdW5jKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBrZXlzLm1hcChmdW5jdGlvbihrKXtyZXR1cm4gZnVuYyhrLCB2YWxzW2tdKTt9KTtcclxuICAgICAgICB9LFxyXG4gICAgICAgIHVuc29ydGVkX2RpY3Q6IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgICAgICByZXR1cm4gdmFscztcclxuICAgICAgICB9XHJcbiAgICB9O1xyXG59O1xyXG5cclxuLy8gVXRpbGl0eSBmdW5jdGlvbnMgZm9yIG1hcC9yZWR1Y2VcclxuZGQubWFwID0ge1xyXG4gICAga2V5OiBmdW5jdGlvbihhdHRyLCByZW1hcCkge1xyXG4gICAgICAgIHJldHVybiBmdW5jdGlvbihkLCBlbWl0KSB7XHJcbiAgICAgICAgICAgIHZhciBrZXkgPSBkW2F0dHJdO1xyXG4gICAgICAgICAgICBpZiAocmVtYXAgJiYgcmVtYXBba2V5XSAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgICAgICBrZXkgPSByZW1hcFtrZXldO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVtaXQoa2V5LCBkKTtcclxuICAgICAgICB9O1xyXG4gICAgfSxcclxuICAgIGRpY3Q6IGZ1bmN0aW9uKGRpY3QpIHtcclxuICAgICAgICByZXR1cm4gZnVuY3Rpb24oZCwgZW1pdCkge1xyXG4gICAgICAgICAgICBlbWl0KGQsIGRpY3RbZF0pO1xyXG4gICAgICAgIH07XHJcbiAgICB9XHJcbn07XHJcbmRkLmVtaXQgPSB7XHJcbiAgICBpZGVudDogZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uKGtleSwgdmFsdWVzLCBlbWl0KSB7XHJcbiAgICAgICAgICAgIGVtaXQoa2V5LCB2YWx1ZXMpO1xyXG4gICAgICAgIH07XHJcbiAgICB9LFxyXG4gICAgZmlyc3Q6IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIHJldHVybiBmdW5jdGlvbihrZXksIHZhbHVlcywgZW1pdCkge1xyXG4gICAgICAgICAgICBlbWl0KGtleSwgdmFsdWVzWzBdKTtcclxuICAgICAgICB9O1xyXG4gICAgfSxcclxuICAgIGxhc3Q6IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIHJldHVybiBmdW5jdGlvbihrZXksIHZhbHVlcywgZW1pdCkge1xyXG4gICAgICAgICAgICBlbWl0KGtleSwgdmFsdWVzW3ZhbHVlcy5sZW5ndGggLSAxXSk7XHJcbiAgICAgICAgfTtcclxuICAgIH0sXHJcbiAgICBtZXJnZTogZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uKGtleSwgdmFsdWVzLCBlbWl0KSB7XHJcbiAgICAgICAgICAgIHZhciBvYmogPSB2YWx1ZXMucmVkdWNlKGZ1bmN0aW9uKHByZXYsIGN1cnIpIHtcclxuICAgICAgICAgICAgICAgIHZhciBrZXlzID0gT2JqZWN0LmtleXMoY3Vycik7XHJcbiAgICAgICAgICAgICAgICBmb3IgKHZhciBpPTA7IGk8a2V5cy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICAgICAgICAgIHZhciBrID0ga2V5c1tpXTtcclxuICAgICAgICAgICAgICAgICAgICBwcmV2W2tdID0gY3VycltrXTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHJldHVybiBwcmV2O1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGVtaXQoa2V5LCBvYmopO1xyXG4gICAgICAgIH07XHJcbiAgICB9LFxyXG4gICAgdG9BdHRyOiBmdW5jdGlvbihhdHRyLCBmdW5jKSB7XHJcbiAgICAgICAgZnVuYyA9IGZ1bmMgfHwgZGQuZW1pdC5sYXN0KCk7XHJcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uKGtleSwgdmFsdWVzLCBlbWl0KSB7XHJcbiAgICAgICAgICAgIGZ1bmMoa2V5LCB2YWx1ZXMsIGZ1bmN0aW9uKGssIHYpIHtcclxuICAgICAgICAgICAgICAgIHZhciBvYmogPSB7fTtcclxuICAgICAgICAgICAgICAgIG9ialthdHRyXSA9IHY7XHJcbiAgICAgICAgICAgICAgICBlbWl0KGssIG9iaik7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH07XHJcbiAgICB9LFxyXG4gICAgc3VtOiBmdW5jdGlvbihpbmNsdWRlLCBleGNsdWRlKSB7XHJcbiAgICAgICAgaW5jbHVkZSA9IHdpbGRjYXJkcyhpbmNsdWRlIHx8ICcqJyk7XHJcbiAgICAgICAgZXhjbHVkZSA9IHdpbGRjYXJkcyhleGNsdWRlKTsgICAgICAgXHJcblxyXG4gICAgICAgIHJldHVybiBmdW5jdGlvbihrZXksIHZhbHVlcywgZW1pdCkge1xyXG4gICAgICAgICAgICB2YXIgb2JqID0gdmFsdWVzLnJlZHVjZShmdW5jdGlvbihwcmV2LCBjdXJyKSB7XHJcbiAgICAgICAgICAgICAgICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKGN1cnIpO1xyXG4gICAgICAgICAgICAgICAgZm9yICh2YXIgaT0wOyBpPGtleXMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgICAgICAgICB2YXIga2V5ID0ga2V5c1tpXSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgZG9BZGQgPSBmYWxzZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgajtcclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICBmb3IgKGo9MDsgajxpbmNsdWRlLmxlbmd0aDsgaisrKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChrZXkuc2VhcmNoKGluY2x1ZGVbaV0pID4gLTEpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRvQWRkID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGZvciAoaj0wOyBqPGV4Y2x1ZGUubGVuZ3RoOyBqKyspIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGtleS5zZWFyY2goaW5jbHVkZVtqXSkgPiAtMSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZG9BZGQgPSBmYWxzZTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIGlmIChkb0FkZCAmJiBwcmV2W2tleV0gJiYgY3VycltrZXldICYmICFpc05hTihwcmV2W2tleV0pICYmICFpc05hTihjdXJyW2tleV0pKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHByZXZba2V5XSA9IHByZXZba2V5XSArIGN1cnJba2V5XTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHByZXZba2V5XSA9IGN1cnJba2V5XTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGRvQWRkKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oXCJkYXRhZGF0YS5lbWl0LnN1bSgpOiBDYW5ub3QgYWRkIGtleXMgXCIgKyBrZXkgKyBcIiFcIik7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gcHJldjtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBlbWl0KGtleSwgb2JqKTtcclxuICAgICAgICB9O1xyXG4gICAgfVxyXG59O1xyXG5cclxuZGQubWFwLmdlbyA9IHtcclxuICAgIHBvaW50OiBmdW5jdGlvbihsYXRQcm9wLCBsb25Qcm9wLCBrZXlQcm9wKSB7XHJcbiAgICAgICAgdmFyIGlkID0gMDtcclxuICAgICAgICByZXR1cm4gZnVuY3Rpb24oZCwgZW1pdCkge1xyXG4gICAgICAgICAgICB2YXIga2V5ID0ga2V5UHJvcCA/IGRba2V5UHJvcF0gOiBpZCsrO1xyXG4gICAgICAgICAgICBlbWl0KGtleSwgZGQuZ2VvLlBvaW50KGRbbG9uUHJvcF0sIGRbbGF0UHJvcF0sIGQpKTtcclxuICAgICAgICB9O1xyXG4gICAgfVxyXG59O1xyXG5cclxuZGQuZW1pdC5nZW8gPSB7XHJcbiAgICBzZWdtZW50czogZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uKGtleSwgZGF0YSwgZW1pdCkge1xyXG4gICAgICAgICAgICB2YXIgcHJldiA9IG51bGwsIGN1ciA9IG51bGw7XHJcbiAgICAgICAgICAgIGZvciAodmFyIGk9MDsgaTxkYXRhLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgICAgICBjdXIgPSBkYXRhW2ldO1xyXG4gICAgICAgICAgICAgICAgaWYgKHByZXYpIHtcclxuICAgICAgICAgICAgICAgICAgICBlbWl0KGtleSArICctJyArIGksIGRkLmdlby5MaW5lU3RyaW5nKFtbcHJldi5sb24scHJldi5sYXRdLFtjdXIubG9uLGN1ci5sYXRdXSwgcHJldikpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgcHJldiA9IGN1cjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH07XHJcbiAgICB9XHJcbn07XHJcblxyXG4vLyBjb25zdHJ1Y3RvcnMgZm9yIEdlb0pTT04gb2JqZWN0c1xyXG5kZC5nZW8gPSB7XHJcbiAgICBQb2ludDogZnVuY3Rpb24obG9uLCBsYXQsIHByb3BlcnRpZXMpIHtcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICB0eXBlOiAnRmVhdHVyZScsXHJcbiAgICAgICAgICAgIGdlb21ldHJ5OiB7XHJcbiAgICAgICAgICAgICAgICB0eXBlOiAnUG9pbnQnLFxyXG4gICAgICAgICAgICAgICAgY29vcmRpbmF0ZXM6IFtsb24sIGxhdF1cclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgcHJvcGVydGllczogcHJvcGVydGllc1xyXG4gICAgICAgIH07XHJcbiAgICB9LFxyXG4gICAgTGluZVN0cmluZzogZnVuY3Rpb24oY29vcmRpbmF0ZXMsIHByb3BlcnRpZXMpIHtcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICB0eXBlOiAnRmVhdHVyZScsXHJcbiAgICAgICAgICAgIGdlb21ldHJ5OiB7XHJcbiAgICAgICAgICAgICAgICB0eXBlOiAnTGluZVN0cmluZycsXHJcbiAgICAgICAgICAgICAgICBjb29yZGluYXRlczogY29vcmRpbmF0ZXNcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgcHJvcGVydGllczogcHJvcGVydGllc1xyXG4gICAgICAgIH07XHJcbiAgICB9XHJcbn07XHJcblxyXG5mdW5jdGlvbiB3aWxkY2FyZHMoc3BlYykge1xyXG4gICAgc3BlYyA9IGRkLnRvQXJyYXkoc3BlYyk7XHJcbiAgICBmb3IgKHZhciBpPTA7IGk8c3BlYy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgIGlmICghKHNwZWNbaV0gaW5zdGFuY2VvZiBSZWdFeHApKSB7XHJcbiAgICAgICAgICAgIHNwZWNbaV0gPSBuZXcgUmVnRXhwKCdeJyArIHNwZWNbaV0ucmVwbGFjZSgnKicsJy4qJykucmVwbGFjZSgnPycsJy4nKSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIHNwZWM7XHJcbn1cclxuXHJcbi8vIGh0dHBzOi8vY29kZS5nb29nbGUuY29tL3AvbWFwcmVkdWNlLWpzL1xyXG4vLyBNb3ppbGxhIFB1YmxpYyBMaWNlbnNlXHJcbmRkLm1hcHJlZHVjZSA9IGZ1bmN0aW9uIChkYXRhLCBtYXAsIHJlZHVjZSkge1xyXG5cdHZhciBtYXBSZXN1bHQgPSBbXSxcclxuICAgICAgICByZWR1Y2VSZXN1bHQgPSBkZC5PcmRlcmVkSGFzaCgpLFxyXG4gICAgICAgIHJlZHVjZUtleTtcclxuXHRcclxuICAgIHJlZHVjZSA9IHJlZHVjZSB8fCBkZC5lbWl0Lmxhc3QoKTsgLy8gZGVmYXVsdFxyXG4gICAgXHJcblx0dmFyIG1hcEVtaXQgPSBmdW5jdGlvbihrZXksIHZhbHVlKSB7XHJcbiAgICAgICAgaWYgKGtleSA9PSBudWxsKSByZXR1cm47IC8vIGRvIG5vdCBlbWl0IGlmIGtleSBpcyBudWxsIG9yIHVuZGVmaW5lZFxyXG5cdFx0aWYoIW1hcFJlc3VsdFtrZXldKSB7XHJcblx0XHRcdG1hcFJlc3VsdFtrZXldID0gW107XHJcblx0XHR9XHJcblx0XHRtYXBSZXN1bHRba2V5XS5wdXNoKHZhbHVlKTtcclxuXHR9O1xyXG5cdFxyXG5cdHZhciByZWR1Y2VFbWl0ID0gZnVuY3Rpb24oa2V5LCB2YWx1ZSkge1xyXG5cdFx0cmVkdWNlUmVzdWx0LnB1c2goa2V5LCB2YWx1ZSk7XHJcblx0fTtcclxuXHRcclxuXHRmb3IodmFyIGkgPSAwOyBpIDwgZGF0YS5sZW5ndGg7IGkrKykge1xyXG5cdFx0bWFwKGRhdGFbaV0sIG1hcEVtaXQpO1xyXG5cdH1cclxuXHRcclxuXHRmb3IocmVkdWNlS2V5IGluIG1hcFJlc3VsdCkge1xyXG5cdFx0cmVkdWNlKHJlZHVjZUtleSwgbWFwUmVzdWx0W3JlZHVjZUtleV0sIHJlZHVjZUVtaXQpO1xyXG5cdH1cclxuXHRcclxuXHRyZXR1cm4gcmVkdWNlUmVzdWx0O1xyXG59O1xyXG5cclxuZGQubWFwcmVkdWNlciA9IGZ1bmN0aW9uKG1hcCwgcmVkdWNlKSB7XHJcbiAgICByZXR1cm4gZnVuY3Rpb24oZGF0YSkge1xyXG4gICAgICAgIGRkLm1hcHJlZHVjZShkYXRhLCBtYXAsIHJlZHVjZSk7XHJcbiAgICB9O1xyXG59O1xyXG4vLyBIZWxwZXIgZnVuY3Rpb25zIGZvciBtYXAgZXRjLlxyXG5cclxuLy8gcHV0ICdkJyBpbiBhbm90aGVyIG9iamVjdCB1c2luZyB0aGUgYXR0cmlidXRlICdrZXknXHJcbi8vIG9wdGlvbmFsICdwdWxsJyBpcyB0aGUgbmFtZSBvZiBhIGtleSB0byBsZWF2ZSBvbiB0aGUgdG9wIGxldmVsIFxyXG5kZC5lbnZlbG9wZSA9IGZ1bmN0aW9uKGtleSwgcHVsbCwgZnVuYykge1xyXG4gICAgcmV0dXJuIGZ1bmN0aW9uKGQpIHtcclxuICAgICAgICBpZiAocHVsbCAmJiB0eXBlb2YgcHVsbCA9PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgICAgIC8vIGVudmVsb3BlKGtleSwgZnVuYykgY2FzZVxyXG4gICAgICAgICAgICBmdW5jID0gcHVsbDtcclxuICAgICAgICAgICAgcHVsbCA9IG51bGw7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChmdW5jKSBkID0gZnVuYyhkKTtcclxuICAgICAgICB2YXIgdmFsID0ge307XHJcbiAgICAgICAgdmFsW2tleV0gPSBkO1xyXG4gICAgICAgIGlmIChwdWxsKSB7XHJcbiAgICAgICAgICAgIHZhbFtwdWxsXSA9IGRbcHVsbF07XHJcbiAgICAgICAgICAgIGRlbGV0ZSBkW3B1bGxdO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gdmFsO1xyXG4gICAgfTtcclxufTtcclxuZGQucHJlZml4ID0gZnVuY3Rpb24ocHJlZml4LCBmdW5jKSB7XHJcbiAgICByZXR1cm4gZnVuY3Rpb24oZCkge1xyXG4gICAgXHJcbiAgICAgICAgaWYgKGZ1bmMpIGQgPSBmdW5jKGQpO1xyXG4gICAgXHJcbiAgICAgICAgdmFyIHZhbCA9IHt9LFxyXG4gICAgICAgICAgICBrZXlzID0gT2JqZWN0LmtleXMoZCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgIGZvciAodmFyIGk9MDsgaTxrZXlzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgIHZhbFtwcmVmaXggKyBrZXlzW2ldXSA9IGRba2V5c1tpXV07XHJcbiAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICByZXR1cm4gdmFsO1xyXG4gICAgfTtcclxufTtcclxuZGQucHJlZml4X2F0dHIgPSBmdW5jdGlvbihhdHRyLCBmdW5jKSB7XHJcbiAgICByZXR1cm4gZnVuY3Rpb24oZCkge1xyXG4gICAgXHJcbiAgICAgICAgaWYgKGZ1bmMpIGQgPSBmdW5jKGQpO1xyXG4gICAgXHJcbiAgICAgICAgdmFyIHZhbCA9IHt9LFxyXG4gICAgICAgICAgICBrZXlzID0gT2JqZWN0LmtleXMoZCksXHJcbiAgICAgICAgICAgIHByZWZpeCA9IGRbYXR0cl0gPyBkW2F0dHJdICsgJ18nIDogJyc7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgIGZvciAodmFyIGk9MDsgaTxrZXlzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgIHZhbFtwcmVmaXggKyBrZXlzW2ldXSA9IGRba2V5c1tpXV07XHJcbiAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICByZXR1cm4gdmFsO1xyXG4gICAgfTtcclxufTtcclxuZGQubWFwX2F0dHIgPSBmdW5jdGlvbihtYXAsIGZ1bmMpIHtcclxuICAgIHJldHVybiBmdW5jdGlvbihkKSB7XHJcbiAgICBcclxuICAgICAgICBpZiAoZnVuYykgZCA9IGZ1bmMoZCk7XHJcbiAgICBcclxuICAgICAgICBpZiAodHlwZW9mIG1hcCA9PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgICAgIGQgPSBtYXAoZCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKG1hcCk7XHJcbiAgICAgICAgICAgIGZvciAodmFyIGk9MDsgaTxrZXlzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgICAgICB2YXIga2V5ID0ga2V5c1tpXTtcclxuICAgICAgICAgICAgICAgIHZhciB2YWwgPSBtYXBba2V5XTtcclxuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgdmFsID09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICAgICAgICAgICAgICBkW2tleV0gPSB2YWwoZCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBlbHNlIGlmIChkW3ZhbF0pIHtcclxuICAgICAgICAgICAgICAgICAgICBkW2tleV0gPSBkW3ZhbF07XHJcbiAgICAgICAgICAgICAgICAgICAgZGVsZXRlIGRbdmFsXTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgcmV0dXJuIGQ7XHJcbiAgICB9O1xyXG59O1xyXG5kZC5yZXZlcnNlID0gZnVuY3Rpb24oZGF0YSkge1xyXG4gICAgaWYgKGRhdGEuc2xpY2UgJiYgdHlwZW9mIGRhdGEuc2xpY2UgPT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgIC8vIHNsaWNlKCkgPSBjb3B5XHJcbiAgICAgICAgcmV0dXJuIGRhdGEuc2xpY2UoKS5yZXZlcnNlKCk7IFxyXG4gICAgfVxyXG4gICAgcmV0dXJuIGRhdGE7XHJcbn07XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IGRkO1xyXG4iLG51bGwsIi8qISBtYXBtYXAuanMgMC4yLjgtZGV2LjAgwqkgMjAxNC0yMDE1IEZsb3JpYW4gTGVkZXJtYW5uIFxyXG5cclxuVGhpcyBwcm9ncmFtIGlzIGZyZWUgc29mdHdhcmU6IHlvdSBjYW4gcmVkaXN0cmlidXRlIGl0IGFuZC9vciBtb2RpZnlcclxuaXQgdW5kZXIgdGhlIHRlcm1zIG9mIHRoZSBHTlUgQWZmZXJvIEdlbmVyYWwgUHVibGljIExpY2Vuc2UgYXMgcHVibGlzaGVkIGJ5XHJcbnRoZSBGcmVlIFNvZnR3YXJlIEZvdW5kYXRpb24sIGVpdGhlciB2ZXJzaW9uIDMgb2YgdGhlIExpY2Vuc2UsIG9yXHJcbihhdCB5b3VyIG9wdGlvbikgYW55IGxhdGVyIHZlcnNpb24uXHJcblxyXG5UaGlzIHByb2dyYW0gaXMgZGlzdHJpYnV0ZWQgaW4gdGhlIGhvcGUgdGhhdCBpdCB3aWxsIGJlIHVzZWZ1bCxcclxuYnV0IFdJVEhPVVQgQU5ZIFdBUlJBTlRZOyB3aXRob3V0IGV2ZW4gdGhlIGltcGxpZWQgd2FycmFudHkgb2ZcclxuTUVSQ0hBTlRBQklMSVRZIG9yIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFLiAgU2VlIHRoZVxyXG5HTlUgQWZmZXJvIEdlbmVyYWwgUHVibGljIExpY2Vuc2UgZm9yIG1vcmUgZGV0YWlscy5cclxuXHJcbllvdSBzaG91bGQgaGF2ZSByZWNlaXZlZCBhIGNvcHkgb2YgdGhlIEdOVSBBZmZlcm8gR2VuZXJhbCBQdWJsaWMgTGljZW5zZVxyXG5hbG9uZyB3aXRoIHRoaXMgcHJvZ3JhbS4gIElmIG5vdCwgc2VlIDxodHRwOi8vd3d3LmdudS5vcmcvbGljZW5zZXMvPi5cclxuKi9cclxuXHJcbnZhciBkZCA9IHJlcXVpcmUoJ2RhdGFkYXRhJyk7XHJcblxyXG52YXIgdmVyc2lvbiA9ICcwLjIuOC1kZXYuMCc7XHJcblxyXG5mdW5jdGlvbiBhc3NlcnQodGVzdCwgbWVzc2FnZSkgeyBpZiAodGVzdCkgcmV0dXJuOyB0aHJvdyBuZXcgRXJyb3IoXCJbbWFwbWFwXSBcIiArIG1lc3NhZ2UpO31cclxuYXNzZXJ0KHdpbmRvdy5kMywgXCJkMy5qcyBpcyByZXF1aXJlZCFcIik7XHJcbmFzc2VydCh3aW5kb3cuUHJvbWlzZSwgXCJQcm9taXNlcyBub3QgYXZhaWxhYmxlIGluIHlvdXIgYnJvd3NlciAtIHBsZWFzZSBhZGQgdGhlIG5lY2Vzc2FyeSBwb2x5ZmlsbCwgYXMgZGV0YWlsZWQgaW4gaHR0cHM6Ly9naXRodWIuY29tL2Zsb2xlZGVybWFubi9tYXBtYXAuanMjdXNpbmctbWFwbWFwanNcIik7XHJcblxyXG52YXIgZGVmYXVsdF9zZXR0aW5ncyA9IHtcclxuICAgIGxvY2FsZTogJ2VuJyxcclxuICAgIGtlZXBBc3BlY3RSYXRpbzogdHJ1ZSxcclxuICAgIHBsYWNlaG9sZGVyQ2xhc3NOYW1lOiAncGxhY2Vob2xkZXInLFxyXG4gICAgc3ZnQXR0cmlidXRlczoge1xyXG4gICAgICAgICdvdmVyZmxvdyc6ICdoaWRkZW4nIC8vIG5lZWRlZCBmb3IgSUVcclxuICAgIH0sXHJcbiAgICBwYXRoQXR0cmlidXRlczoge1xyXG4gICAgICAgICdmaWxsJzogJ25vbmUnLFxyXG4gICAgICAgICdzdHJva2UnOiAnIzAwMCcsXHJcbiAgICAgICAgJ3N0cm9rZS13aWR0aCc6ICcwLjInLFxyXG4gICAgICAgICdzdHJva2UtbGluZWpvaW4nOiAnYmV2ZWwnLFxyXG4gICAgICAgICdwb2ludGVyLWV2ZW50cyc6ICdub25lJ1xyXG4gICAgfSxcclxuICAgIGJhY2tncm91bmRBdHRyaWJ1dGVzOiB7XHJcbiAgICAgICAgJ3dpZHRoJzogJzMwMCUnLFxyXG4gICAgICAgICdoZWlnaHQnOiAnMzAwJScsXHJcbiAgICAgICAgJ2ZpbGwnOiAnbm9uZScsXHJcbiAgICAgICAgJ3N0cm9rZSc6ICdub25lJyxcclxuICAgICAgICAndHJhbnNmb3JtJzogJ3RyYW5zbGF0ZSgtODAwLC00MDApJyxcclxuICAgICAgICAncG9pbnRlci1ldmVudHMnOiAnYWxsJ1xyXG4gICAgfSxcclxuICAgIG92ZXJsYXlBdHRyaWJ1dGVzOiB7XHJcbiAgICAgICAgJ2ZpbGwnOiAnI2ZmZmZmZicsXHJcbiAgICAgICAgJ2ZpbGwtb3BhY2l0eSc6ICcwLjInLFxyXG4gICAgICAgICdzdHJva2Utd2lkdGgnOiAnMC44JyxcclxuICAgICAgICAnc3Ryb2tlJzogJyMzMzMnLFxyXG4gICAgICAgICdwb2ludGVyLWV2ZW50cyc6ICdub25lJ1xyXG4gICAgfSxcclxuICAgIGRlZmF1bHRNZXRhZGF0YToge1xyXG4gICAgICAgIC8vIGRvbWFpbjogIGlzIGRldGVybWluZWQgYnkgZGF0YSBhbmFseXNpc1xyXG4gICAgICAgIHNjYWxlOiAncXVhbnRpemUnLFxyXG4gICAgICAgIGNvbG9yczogW1wiI2ZmZmZjY1wiLFwiI2M3ZTliNFwiLFwiIzdmY2RiYlwiLFwiIzQxYjZjNFwiLFwiIzJjN2ZiOFwiLFwiIzI1MzQ5NFwiXSwgLy8gQ29sb3JicmV3ZXIgWWxHbkJ1WzZdIFxyXG4gICAgICAgIHVuZGVmaW5lZFZhbHVlOiBcIlwiLCAvL1widW5kZWZpbmVkXCJcclxuICAgICAgICAvL3VuZGVmaW5lZExhYmVsOiAtPiBmcm9tIGxvY2FsZVxyXG4gICAgICAgIHVuZGVmaW5lZENvbG9yOiAndHJhbnNwYXJlbnQnXHJcbiAgICB9XHJcbn07XHJcblxyXG52YXIgbWFwbWFwID0gZnVuY3Rpb24oZWxlbWVudCwgb3B0aW9ucykge1xyXG4gICAgLy8gZW5zdXJlIGNvbnN0cnVjdG9yIGludm9jYXRpb25cclxuICAgIGlmICghKHRoaXMgaW5zdGFuY2VvZiBtYXBtYXApKSByZXR1cm4gbmV3IG1hcG1hcChlbGVtZW50LCBvcHRpb25zKTtcclxuXHJcbiAgICB0aGlzLnNldHRpbmdzID0ge307ICAgIFxyXG4gICAgdGhpcy5vcHRpb25zKG1hcG1hcC5leHRlbmQoe30sIGRlZmF1bHRfc2V0dGluZ3MsIG9wdGlvbnMpKTtcclxuICAgIFxyXG4gICAgLy8gcHJvbWlzZXNcclxuICAgIHRoaXMuX3Byb21pc2UgPSB7XHJcbiAgICAgICAgZ2VvbWV0cnk6IG51bGwsXHJcbiAgICAgICAgZGF0YTogbnVsbFxyXG4gICAgfTtcclxuXHJcbiAgICB0aGlzLnNlbGVjdGVkID0gbnVsbDtcclxuICAgIFxyXG4gICAgdGhpcy5sYXllcnMgPSBuZXcgZGQuT3JkZXJlZEhhc2goKTtcclxuICAgIC8vdGhpcy5pZGVudGlmeV9mdW5jID0gaWRlbnRpZnlfbGF5ZXI7XHJcbiAgICB0aGlzLmlkZW50aWZ5X2Z1bmMgPSBpZGVudGlmeV9ieV9wcm9wZXJ0aWVzKCk7XHJcbiAgICBcclxuICAgIHRoaXMubWV0YWRhdGFfc3BlY3MgPSBbXTtcclxuXHJcbiAgICAvLyBjb252ZXJ0IHNlbGV0b3IgZXhwcmVzc2lvbiB0byBub2RlXHJcbiAgICBlbGVtZW50ID0gZDMuc2VsZWN0KGVsZW1lbnQpLm5vZGUoKTtcclxuIFxyXG4gICAgLy8gZGVmYXVsdHNcclxuICAgIHRoaXMuX3Byb2plY3Rpb24gPSBkMy5nZW8ubWVyY2F0b3IoKS5zY2FsZSgxKTtcclxuICAgIFxyXG4gICAgdGhpcy5pbml0RW5naW5lKGVsZW1lbnQpO1xyXG4gICAgdGhpcy5pbml0RXZlbnRzKGVsZW1lbnQpO1xyXG4gICAgXHJcbiAgICB0aGlzLmRpc3BhdGNoZXIgPSBkMy5kaXNwYXRjaCgnY2hvcm9wbGV0aCcsJ3ZpZXcnLCdjbGljaycsJ21vdXNlZG93bicsJ21vdXNldXAnLCdtb3VzZW1vdmUnKTtcclxuICAgIFxyXG4gICAgcmV0dXJuIHRoaXM7ICAgIFxyXG59O1xyXG5cclxuLy8gZXhwb3NlIGRhdGFkYXRhIGxpYnJhcnkgaW4gY2FzZSB3ZSBhcmUgYnVuZGxlZCBmb3IgYnJvd3NlclxyXG4vLyAoYnJvd3NlcmlmeSBkb2Vzbid0IHN1cHBvcnQgbXV0bGlwbGUgZ2xvYmFsIGV4cG9ydHMpXHJcbm1hcG1hcC5kYXRhZGF0YSA9IGRkO1xyXG5cclxubWFwbWFwLnByb3RvdHlwZSA9IHtcclxuXHR2ZXJzaW9uOiB2ZXJzaW9uXHJcbn07XHJcblxyXG5tYXBtYXAuZXh0ZW5kID0gZnVuY3Rpb24gZXh0ZW5kKCl7XHJcbiAgICBmb3IodmFyIGk9MTsgaTxhcmd1bWVudHMubGVuZ3RoOyBpKyspXHJcbiAgICAgICAgZm9yKHZhciBrZXkgaW4gYXJndW1lbnRzW2ldKVxyXG4gICAgICAgICAgICBpZihhcmd1bWVudHNbaV0uaGFzT3duUHJvcGVydHkoa2V5KSlcclxuICAgICAgICAgICAgICAgIGFyZ3VtZW50c1swXVtrZXldID0gYXJndW1lbnRzW2ldW2tleV07XHJcbiAgICByZXR1cm4gYXJndW1lbnRzWzBdO1xyXG59XHJcblxyXG5tYXBtYXAucHJvdG90eXBlLmluaXRFbmdpbmUgPSBmdW5jdGlvbihlbGVtZW50KSB7XHJcbiAgICAvLyBTVkcgc3BlY2lmaWMgaW5pdGlhbGl6YXRpb24sIGZvciBub3cgd2UgaGF2ZSBubyBlbmdpbmUgc3dpdGNoaW5nIGZ1bmN0aW9uYWxpdHlcclxuICAgIFxyXG4gICAgLy8gSFRNTCBlbGVtZW50cywgc3RvcmVkIGFzIGQzIHNlbGVjdGlvbnMgICAgXHJcbiAgICB2YXIgbWFpbkVsID0gZDMuc2VsZWN0KGVsZW1lbnQpLmNsYXNzZWQoJ21hcG1hcCcsIHRydWUpLFxyXG4gICAgICAgIG1hcEVsID0gbWFpbkVsLmFwcGVuZCgnZycpLmF0dHIoJ2NsYXNzJywgJ21hcCcpO1xyXG4gICAgXHJcbiAgICBtYWluRWwuYXR0cih0aGlzLnNldHRpbmdzLnN2Z0F0dHJpYnV0ZXMpO1xyXG4gICAgXHJcbiAgICB0aGlzLl9lbGVtZW50cyA9IHtcclxuICAgICAgICBtYWluOiBtYWluRWwsXHJcbiAgICAgICAgbWFwOiBtYXBFbCxcclxuICAgICAgICBwYXJlbnQ6IGQzLnNlbGVjdChtYWluRWwubm9kZSgpLnBhcmVudE5vZGUpLFxyXG4gICAgICAgIC8vIGNoaWxkIGVsZW1lbnRzXHJcbiAgICAgICAgZGVmczogbWFpbkVsLmluc2VydCgnZGVmcycsICcubWFwJyksXHJcbiAgICAgICAgYmFja2dyb3VuZEdlb21ldHJ5OiBtYXBFbC5hcHBlbmQoJ2cnKS5hdHRyKCdjbGFzcycsICdiYWNrZ3JvdW5kLWdlb21ldHJ5JyksXHJcbiAgICAgICAgYmFja2dyb3VuZDogbWFwRWwuYXBwZW5kKCdyZWN0JykuYXR0cignY2xhc3MnLCAnYmFja2dyb3VuZCcpLmF0dHIodGhpcy5zZXR0aW5ncy5iYWNrZ3JvdW5kQXR0cmlidXRlcyksXHJcbiAgICAgICAgc2hhZG93R3JvdXA6IG1hcEVsLmFwcGVuZCgnZycpLFxyXG4gICAgICAgIGdlb21ldHJ5OiBtYXBFbC5hcHBlbmQoJ2cnKS5hdHRyKCdjbGFzcycsICdnZW9tZXRyeScpLFxyXG4gICAgICAgIG92ZXJsYXk6IG1hcEVsLmFwcGVuZCgnZycpLmF0dHIoJ2NsYXNzJywgJ292ZXJsYXlzJyksXHJcbiAgICAgICAgZml4ZWQ6IG1haW5FbC5hcHBlbmQoJ2cnKS5hdHRyKCdjbGFzcycsICdmaXhlZCcpLFxyXG4gICAgICAgIGxlZ2VuZDogbWFpbkVsLmFwcGVuZCgnZycpLmF0dHIoJ2NsYXNzJywgJ2xlZ2VuZCcpLFxyXG4gICAgICAgIHBsYWNlaG9sZGVyOiBtYWluRWwuc2VsZWN0KCcuJyArIHRoaXMuc2V0dGluZ3MucGxhY2Vob2xkZXJDbGFzc05hbWUpXHJcbiAgICB9O1xyXG4gICAgXHJcbiAgICAvLyBzZXQgdXAgd2lkdGgvaGVpZ2h0XHJcbiAgICB0aGlzLndpZHRoID0gbnVsbDtcclxuICAgIHRoaXMuaGVpZ2h0ID0gbnVsbDtcclxuICAgIFxyXG4gICAgLy8gVE9ETzogdXNlIG9wdGlvbnMud2lkdGggfHwgb3B0aW9ucy5kZWZhdWx0V2lkdGggZXRjLlxyXG4gICAgaWYgKCF0aGlzLndpZHRoKSB7XHJcbiAgICAgICAgdGhpcy53aWR0aCA9IHBhcnNlSW50KG1haW5FbC5hdHRyKCd3aWR0aCcpKSB8fCA4MDA7XHJcbiAgICB9XHJcbiAgICBpZiAoIXRoaXMuaGVpZ2h0KSB7XHJcbiAgICAgICAgdGhpcy5oZWlnaHQgPSBwYXJzZUludChtYWluRWwuYXR0cignaGVpZ2h0JykpIHx8IDQwMDtcclxuICAgIH1cclxuICAgIHZhciB2aWV3Qm94ID0gbWFpbkVsLmF0dHIoJ3ZpZXdCb3gnKTtcclxuICAgIGlmICghdmlld0JveCkge1xyXG4gICAgICAgIG1haW5FbC5hdHRyKCd2aWV3Qm94JywgJzAgMCAnICsgdGhpcy53aWR0aCArICcgJyArIHRoaXMuaGVpZ2h0KTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgdGhpcy5fZWxlbWVudHMuZGVmcy5hcHBlbmQoJ2ZpbHRlcicpXHJcbiAgICAgICAgLmF0dHIoJ2lkJywgJ3NoYWRvdy1nbG93JylcclxuICAgICAgICAuYXBwZW5kKCdmZUdhdXNzaWFuQmx1cicpXHJcbiAgICAgICAgLmF0dHIoJ3N0ZERldmlhdGlvbicsIDUpO1xyXG5cclxuICAgIHRoaXMuX2VsZW1lbnRzLmRlZnMuYXBwZW5kKCdmaWx0ZXInKVxyXG4gICAgICAgIC5hdHRyKCdpZCcsICdsaWdodC1nbG93JylcclxuICAgICAgICAuYXBwZW5kKCdmZUdhdXNzaWFuQmx1cicpXHJcbiAgICAgICAgLmF0dHIoJ3N0ZERldmlhdGlvbicsIDEpO1xyXG4gICAgXHJcbiAgICB0aGlzLl9lbGVtZW50cy5zaGFkb3dFbCA9IHRoaXMuX2VsZW1lbnRzLnNoYWRvd0dyb3VwXHJcbiAgICAgICAgLmFwcGVuZCgnZycpXHJcbiAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ3NoYWRvdycpXHJcbiAgICAgICAgLmF0dHIoJ2ZpbHRlcicsICd1cmwoI3NoYWRvdy1nbG93KScpO1xyXG4gICAgICAgIFxyXG4gICAgdGhpcy5fZWxlbWVudHMuc2hhZG93Q3JvcEVsID0gdGhpcy5fZWxlbWVudHMuc2hhZG93R3JvdXBcclxuICAgICAgICAuYXBwZW5kKCdnJylcclxuICAgICAgICAuYXR0cignY2xhc3MnLCAnc2hhZG93LWNyb3AnKTtcclxuICAgICAgIFxyXG4gICAgdGhpcy5zdXBwb3J0cyA9IHt9O1xyXG4gICAgXHJcbiAgICAvLyBmZWF0dXJlIGRldGVjdGlvblxyXG4gICAgdmFyIGVsID0gdGhpcy5fZWxlbWVudHMubWFpbi5hcHBlbmQoJ3BhdGgnKS5hdHRyKHtcclxuICAgICAgICAncGFpbnQtb3JkZXInOiAnc3Ryb2tlJyxcclxuICAgICAgICAndmVjdG9yLWVmZmVjdCc6ICdub24tc2NhbGluZy1zdHJva2UnXHJcbiAgICB9KTsgIFxyXG4gICAgXHJcbiAgICB2YXIgdmFsID0gZ2V0Q29tcHV0ZWRTdHlsZShlbC5ub2RlKCkpLmdldFByb3BlcnR5VmFsdWUoJ3BhaW50LW9yZGVyJyk7XHJcbiAgICB0aGlzLnN1cHBvcnRzLnBhaW50T3JkZXIgPSB2YWwgJiYgdmFsLmluZGV4T2YoJ3N0cm9rZScpID09IDA7XHJcbiAgICBcclxuICAgIHZhbCA9IGdldENvbXB1dGVkU3R5bGUoZWwubm9kZSgpKS5nZXRQcm9wZXJ0eVZhbHVlKCd2ZWN0b3ItZWZmZWN0Jyk7XHJcbiAgICB0aGlzLnN1cHBvcnRzLm5vblNjYWxpbmdTdHJva2UgPSB2YWwgJiYgdmFsLmluZGV4T2YoJ25vbi1zY2FsaW5nLXN0cm9rZScpID09IDA7XHJcbiAgICB0aGlzLl9lbGVtZW50cy5tYWluLmNsYXNzZWQoJ3N1cHBvcnRzLW5vbi1zY2FsaW5nLXN0cm9rZScsIHRoaXMuc3VwcG9ydHMubm9uU2NhbGluZ1N0cm9rZSk7XHJcbiAgICAgICAgXHJcbiAgICBlbC5yZW1vdmUoKTtcclxuICAgIFxyXG4gICAgLy8gY29tcGF0aWJpbGl0eSBzZXR0aW5nc1xyXG4gICAgaWYgKG5hdmlnYXRvci51c2VyQWdlbnQuaW5kZXhPZignTVNJRScpICE9PSAtMSB8fCBuYXZpZ2F0b3IuYXBwVmVyc2lvbi5pbmRleE9mKCdUcmlkZW50LycpID4gMCkge1xyXG4gICAgICAgIHRoaXMuc3VwcG9ydHMuaG92ZXJEb21Nb2RpZmljYXRpb24gPSBmYWxzZTtcclxuICAgIH1cclxuICAgIGVsc2Uge1xyXG4gICAgICAgIHRoaXMuc3VwcG9ydHMuaG92ZXJEb21Nb2RpZmljYXRpb24gPSB0cnVlO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyBGaXJlZm94IDwgMzUgd2lsbCByZXBvcnQgd3JvbmcgQm91bmRpbmdDbGllbnRSZWN0IChhZGRpbmcgY2xpcHBlZCBiYWNrZ3JvdW5kKSxcclxuICAgIC8vIGh0dHBzOi8vYnVnemlsbGEubW96aWxsYS5vcmcvc2hvd19idWcuY2dpP2lkPTUzMDk4NVxyXG4gICAgdmFyIG1hdGNoID0gL0ZpcmVmb3hcXC8oXFxkKykvLmV4ZWMobmF2aWdhdG9yLnVzZXJBZ2VudCk7XHJcbiAgICBpZiAobWF0Y2ggJiYgcGFyc2VJbnQobWF0Y2hbMV0pIDwgMzUpIHtcclxuICAgICAgICB0aGlzLnN1cHBvcnRzLnN2Z0dldEJvdW5kaW5nQ2xpZW50UmVjdCA9IGZhbHNlO1xyXG4gICAgfVxyXG4gICAgZWxzZSB7XHJcbiAgICAgICAgdGhpcy5zdXBwb3J0cy5zdmdHZXRCb3VuZGluZ0NsaWVudFJlY3QgPSB0cnVlO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICB2YXIgbWFwID0gdGhpcztcclxuICAgIC8vIHNhdmUgdmlld3BvcnQgc3RhdGUgc2VwYXJhdGVseSwgYXMgem9vbSBtYXkgbm90IGhhdmUgZXhhY3QgdmFsdWVzIChkdWUgdG8gYW5pbWF0aW9uIGludGVycG9sYXRpb24pXHJcbiAgICB0aGlzLmN1cnJlbnRfc2NhbGUgPSAxO1xyXG4gICAgdGhpcy5jdXJyZW50X3RyYW5zbGF0ZSA9IFswLDBdO1xyXG4gICAgXHJcbiAgICB0aGlzLnpvb20gPSBkMy5iZWhhdmlvci56b29tKClcclxuICAgICAgICAudHJhbnNsYXRlKFswLCAwXSlcclxuICAgICAgICAuc2NhbGUoMSlcclxuICAgICAgICAuc2NhbGVFeHRlbnQoWzEsIDhdKVxyXG4gICAgICAgIC5vbignem9vbScsIGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgbWFwLmN1cnJlbnRfc2NhbGUgPSBkMy5ldmVudC5zY2FsZTtcclxuICAgICAgICAgICAgbWFwLmN1cnJlbnRfdHJhbnNsYXRlID0gZDMuZXZlbnQudHJhbnNsYXRlO1xyXG4gICAgICAgICAgICBtYXBFbC5hdHRyKCd0cmFuc2Zvcm0nLCAndHJhbnNsYXRlKCcgKyBkMy5ldmVudC50cmFuc2xhdGUgKyAnKXNjYWxlKCcgKyBkMy5ldmVudC5zY2FsZSArICcpJyk7XHJcbiAgICAgICAgICAgIGlmICghbWFwLnN1cHBvcnRzLm5vblNjYWxpbmdTdHJva2UpIHtcclxuICAgICAgICAgICAgICAgIC8vbWFwLl9lbGVtZW50cy5nZW9tZXRyeS5zZWxlY3RBbGwoXCJwYXRoXCIpLnN0eWxlKFwic3Ryb2tlLXdpZHRoXCIsIDEuNSAvIGQzLmV2ZW50LnNjYWxlICsgXCJweFwiKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgIG1hcEVsXHJcbiAgICAgICAgLy8uY2FsbCh0aGlzLnpvb20pIC8vIGZyZWUgbW91c2V3aGVlbCB6b29taW5nXHJcbiAgICAgICAgLmNhbGwodGhpcy56b29tLmV2ZW50KTtcclxuICAgICAgLyogIFxyXG4gICAgdmFyIGRyYWcgPSBkMy5iZWhhdmlvci5kcmFnKClcclxuICAgICAgICAub3JpZ2luKGZ1bmN0aW9uKCkge3JldHVybiB7eDptYXAuY3VycmVudF90cmFuc2xhdGVbMF0seTptYXAuY3VycmVudF90cmFuc2xhdGVbMV19O30pXHJcbiAgICAgICAgLm9uKCdkcmFnc3RhcnQnLCBmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgZDMuZXZlbnQuc291cmNlRXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7IFxyXG4gICAgICAgIH0pXHJcbiAgICAgICAgLm9uKCdkcmFnZW5kJywgZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgIGQzLmV2ZW50LnNvdXJjZUV2ZW50LnN0b3BQcm9wYWdhdGlvbigpOyBcclxuICAgICAgICB9KVxyXG4gICAgICAgIC5vbignZHJhZycsIGZ1bmN0aW9uKCkge1xyXG4gICAgICAgICAgICBtYXAuY3VycmVudF90cmFuc2xhdGUgPSBbZDMuZXZlbnQueCwgZDMuZXZlbnQueV07XHJcbiAgICAgICAgICAgIG1hcEVsLmF0dHIoJ3RyYW5zZm9ybScsICd0cmFuc2xhdGUoJyArIGQzLmV2ZW50LnggKyAnLCcgKyBkMy5ldmVudC55ICsgJylzY2FsZSgnICsgbWFwLmN1cnJlbnRfc2NhbGUgKyAnKScpO1xyXG4gICAgICAgIH0pXHJcbiAgICA7Ki9cclxuICAgICAgICBcclxuICAgIC8vbWFwRWwuY2FsbChkcmFnKTtcclxuICAgIFxyXG4gICAgXHJcbiAgICB2YXIgbWFwID0gdGhpcztcclxuICAgIFxyXG4gICAgZnVuY3Rpb24gY29uc3RydWN0RXZlbnQoZXZlbnQpIHtcclxuICAgICAgICAvLyBUT0RPOiBtYXliZSB0aGlzIHNob3VsZCBiZSBvZmZzZXRYL1ksIGJ1dCB0aGVuIHdlIG5lZWQgdG8gY2hhbmdlXHJcbiAgICAgICAgLy8gem9vbVRvVmlld3BvcnRQb3NpdGlvbiB0byBzdXBwb3J0IGNsaWNrLXRvLXpvb21cclxuICAgICAgICB2YXIgcG9zID0gW2V2ZW50LmNsaWVudFgsIGV2ZW50LmNsaWVudFldXHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgcG9zaXRpb246IHBvcyxcclxuICAgICAgICAgICAgbG9jYXRpb246IG1hcC5fcHJvamVjdGlvbi5pbnZlcnQocG9zKSxcclxuICAgICAgICAgICAgZXZlbnQ6IGV2ZW50XHJcbiAgICAgICAgfVxyXG4gICAgfTtcclxuXHJcbiAgICBtYXBFbC5vbignY2xpY2snLCBmdW5jdGlvbigpIHtcclxuICAgICAgICAvLyBUT0RPOiBjaGVjayBpZiBhbnlvbmUgaXMgbGlzdGVuaW5nLCBlbHNlIHJldHVybiBpbW1lZGlhdGVseVxyXG4gICAgICAgIG1hcC5kaXNwYXRjaGVyLmNsaWNrLmNhbGwobWFwLCBjb25zdHJ1Y3RFdmVudChkMy5ldmVudCkpO1xyXG4gICAgfSk7XHJcblxyXG4gICAgbWFwRWwub24oJ21vdXNlZG93bicsIGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIC8vIFRPRE86IGNoZWNrIGlmIGFueW9uZSBpcyBsaXN0ZW5pbmcsIGVsc2UgcmV0dXJuIGltbWVkaWF0ZWx5XHJcbiAgICAgICAgbWFwLmRpc3BhdGNoZXIubW91c2Vkb3duLmNhbGwobWFwLCBjb25zdHJ1Y3RFdmVudChkMy5ldmVudCkpO1xyXG4gICAgfSk7XHJcblxyXG4gICAgbWFwRWwub24oJ21vdXNldXAnLCBmdW5jdGlvbigpIHtcclxuICAgICAgICAvLyBUT0RPOiBjaGVjayBpZiBhbnlvbmUgaXMgbGlzdGVuaW5nLCBlbHNlIHJldHVybiBpbW1lZGlhdGVseVxyXG4gICAgICAgIG1hcC5kaXNwYXRjaGVyLm1vdXNlZG93bi5jYWxsKG1hcCwgY29uc3RydWN0RXZlbnQoZDMuZXZlbnQpKTtcclxuICAgIH0pO1xyXG5cclxuICAgIG1hcEVsLm9uKCdtb3VzZW1vdmUnLCBmdW5jdGlvbigpIHtcclxuICAgICAgICAvLyBUT0RPOiBjaGVjayBpZiBhbnlvbmUgaXMgbGlzdGVuaW5nLCBlbHNlIHJldHVybiBpbW1lZGlhdGVseVxyXG4gICAgICAgIG1hcC5kaXNwYXRjaGVyLm1vdXNlZG93bi5jYWxsKG1hcCwgY29uc3RydWN0RXZlbnQoZDMuZXZlbnQpKTtcclxuICAgIH0pO1xyXG5cclxufTtcclxuXHJcbm1hcG1hcC5wcm90b3R5cGUuaW5pdEV2ZW50cyA9IGZ1bmN0aW9uKGVsZW1lbnQpIHtcclxuICAgIHZhciBtYXAgPSB0aGlzO1xyXG4gICAgLy8ga2VlcCBhc3BlY3QgcmF0aW8gb24gcmVzaXplXHJcbiAgICBmdW5jdGlvbiByZXNpemUoKSB7XHJcbiAgICBcclxuICAgICAgICBtYXAuYm91bmRzID0gbWFwLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChtYXAuc2V0dGluZ3Mua2VlcEFzcGVjdFJhdGlvKSB7XHJcbiAgICAgICAgICAgIHZhciB3aWR0aCA9IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCd3aWR0aCcpLFxyXG4gICAgICAgICAgICAgICAgaGVpZ2h0ID0gZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2hlaWdodCcpO1xyXG4gICAgICAgICAgICBpZiAod2lkdGggJiYgaGVpZ2h0ICYmIG1hcC5ib3VuZHMud2lkdGgpIHtcclxuICAgICAgICAgICAgICAgIHZhciByYXRpbyA9IHdpZHRoIC8gaGVpZ2h0O1xyXG4gICAgICAgICAgICAgICAgZWxlbWVudC5zdHlsZS5oZWlnaHQgPSAobWFwLmJvdW5kcy53aWR0aCAvIHJhdGlvKSArICdweCc7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHdpbmRvdy5vbnJlc2l6ZSA9IHJlc2l6ZTtcclxuICAgIFxyXG4gICAgcmVzaXplKCk7XHJcbn07XHJcblxyXG52YXIgZG9tYWluID0gWzAsMV07XHJcblxyXG52YXIgbGF5ZXJfY291bnRlciA9IDA7XHJcblxyXG4vLyBUT0RPOiB0aGluayBhYm91dCBjYWNoaW5nIGxvYWRlZCByZXNvdXJjZXMgKCM4KVxyXG5tYXBtYXAucHJvdG90eXBlLmdlb21ldHJ5ID0gZnVuY3Rpb24oc3BlYywga2V5T3JPcHRpb25zKSB7XHJcblxyXG4gICAgLy8ga2V5IGlzIGRlZmF1bHQgb3B0aW9uXHJcbiAgICB2YXIgb3B0aW9ucyA9IGRkLmlzU3RyaW5nKGtleU9yT3B0aW9ucykgPyB7a2V5OiBrZXlPck9wdGlvbnN9IDoga2V5T3JPcHRpb25zO1xyXG5cclxuICAgIG9wdGlvbnMgPSBkZC5tZXJnZSh7XHJcbiAgICAgICAga2V5OiAnaWQnLFxyXG4gICAgICAgIHNldEV4dGVudDogdHJ1ZVxyXG4gICAgICAgIC8vIGxheWVyczogdGFrZW4gZnJvbSBpbnB1dCBvciBhdXRvLWdlbmVyYXRlZCBsYXllciBuYW1lXHJcbiAgICB9LCBvcHRpb25zKTtcclxuXHJcbiAgICB2YXIgbWFwID0gdGhpcztcclxuICAgIFxyXG4gICAgaWYgKGRkLmlzRnVuY3Rpb24oc3BlYykpIHtcclxuICAgICAgICB0aGlzLl9wcm9taXNlLmdlb21ldHJ5LnRoZW4oZnVuY3Rpb24odG9wbyl7XHJcbiAgICAgICAgICAgIHZhciBuZXdfdG9wbyA9IHNwZWModG9wbyk7XHJcbiAgICAgICAgICAgIGlmICh0eXBlb2YgbmV3X3RvcG8ubGVuZ3RoID09ICd1bmRlZmluZWQnKSB7XHJcbiAgICAgICAgICAgICAgICBuZXdfdG9wbyA9IFtuZXdfdG9wb107XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgbmV3X3RvcG8ubWFwKGZ1bmN0aW9uKHQpIHtcclxuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgdC5nZW9tZXRyeS5sZW5ndGggPT0gJ3VuZGVmaW5lZCcpIHtcclxuICAgICAgICAgICAgICAgICAgICB0Lmdlb21ldHJ5ID0gW3QuZ2VvbWV0cnldO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiB0LmluZGV4ID09ICd1bmRlZmluZWQnKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbWFwLmxheWVycy5wdXNoKHQubmFtZSwgdC5nZW9tZXRyeSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICBtYXAubGF5ZXJzLmluc2VydCh0LmluZGV4LCB0Lm5hbWUsIHQuZ2VvbWV0cnkpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgaWYgKG9wdGlvbnMuc2V0RXh0ZW50KSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoIW1hcC5zZWxlY3RlZF9leHRlbnQpIHtcclxuICAgICAgICAgICAgICAgICAgICBtYXAuX2V4dGVudChzcGVjKTsgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgbWFwLmRyYXcoKTtcclxuICAgICAgICAgICAgICAgIGlmIChvcHRpb25zLm9uZHJhdykgb3B0aW9ucy5vbmRyYXcoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHJldHVybiB0aGlzO1xyXG4gICAgfVxyXG5cclxuICAgIGlmIChkZC5pc0RpY3Rpb25hcnkoc3BlYykpIHtcclxuICAgICAgICBpZiAoIW9wdGlvbnMubGF5ZXJzKSB7XHJcbiAgICAgICAgICAgIG9wdGlvbnMubGF5ZXJzID0gJ2xheWVyLScgKyBsYXllcl9jb3VudGVyKys7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHNwZWMgPSBbe3R5cGU6J0ZlYXR1cmUnLGdlb21ldHJ5OnNwZWN9XTtcclxuXHJcbiAgICAgICAgbWFwLmxheWVycy5wdXNoKG9wdGlvbnMubGF5ZXJzLCBzcGVjKTtcclxuICAgICAgICAvLyBhZGQgZHVtbXkgcHJvbWlzZSwgd2UgYXJlIG5vdCBsb2FkaW5nIGFueXRoaW5nXHJcbiAgICAgICAgdmFyIHByb21pc2UgPSBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3QpIHtcclxuICAgICAgICAgICAgcmVzb2x2ZShzcGVjKTtcclxuICAgICAgICB9KTtcclxuICAgICAgICB0aGlzLnByb21pc2VfZGF0YShwcm9taXNlKTtcclxuICAgICAgICAvLyBzZXQgdXAgcHJvamVjdGlvbiBmaXJzdCB0byBhdm9pZCByZXByb2plY3RpbmcgZ2VvbWV0cnlcclxuICAgICAgICAvLyBUT0RPOiBzZXRFeHRlbnQgb3B0aW9ucyBzaG91bGQgYmUgZGVjb3VwbGVkIGZyb20gZHJhd2luZyxcclxuICAgICAgICAvLyB3ZSBuZWVkIGEgd2F5IHRvIGRlZmVyIGJvdGggdW50aWwgZHJhd2luZyBvbiBsYXN0IGdlb20gcHJvbWlzZSB3b3Jrc1xyXG4gICAgICAgIGlmIChvcHRpb25zLnNldEV4dGVudCkge1xyXG4gICAgICAgICAgICBpZiAoIW1hcC5zZWxlY3RlZF9leHRlbnQpIHtcclxuICAgICAgICAgICAgICAgIG1hcC5fZXh0ZW50KHNwZWMpOyAgICAgICAgICAgXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgbWFwLmRyYXcoKTtcclxuICAgICAgICAgICAgaWYgKG9wdGlvbnMub25kcmF3KSBvcHRpb25zLm9uZHJhdygpO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gdGhpcztcclxuICAgIH1cclxuXHJcbiAgICBpZiAoZGQuaXNBcnJheShzcGVjKSkge1xyXG4gICAgICAgIC8vIEFycmF5IGNhc2VcclxuICAgICAgICB2YXIgbmV3X3RvcG8gPSBkZC5tYXByZWR1Y2Uoc3BlYywgb3B0aW9ucy5tYXAsIG9wdGlvbnMucmVkdWNlKTtcclxuICAgICAgICBpZiAoIW9wdGlvbnMubGF5ZXJzKSB7XHJcbiAgICAgICAgICAgIG9wdGlvbnMubGF5ZXJzID0gJ2xheWVyLScgKyBsYXllcl9jb3VudGVyKys7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIG1hcC5sYXllcnMucHVzaChvcHRpb25zLmxheWVycywgbmV3X3RvcG8udmFsdWVzKCkpO1xyXG4gICAgICAgIC8vIGFkZCBkdW1teSBwcm9taXNlLCB3ZSBhcmUgbm90IGxvYWRpbmcgYW55dGhpbmdcclxuICAgICAgICB2YXIgcHJvbWlzZSA9IG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCkge1xyXG4gICAgICAgICAgICByZXNvbHZlKG5ld190b3BvKTtcclxuICAgICAgICB9KTtcclxuICAgICAgICB0aGlzLnByb21pc2VfZGF0YShwcm9taXNlKTtcclxuICAgICAgICAvLyBzZXQgdXAgcHJvamVjdGlvbiBmaXJzdCB0byBhdm9pZCByZXByb2plY3RpbmcgZ2VvbWV0cnlcclxuICAgICAgICBpZiAob3B0aW9ucy5zZXRFeHRlbnQpIHtcclxuICAgICAgICAgICAgaWYgKCFtYXAuc2VsZWN0ZWRfZXh0ZW50KSB7XHJcbiAgICAgICAgICAgICAgICBtYXAuX2V4dGVudChuZXdfdG9wby52YWx1ZXMoKSk7ICAgICAgICAgICBcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAvLyBUT0RPOiB3ZSBuZWVkIGEgc21hcnRlciB3YXkgb2Ygc2V0dGluZyB1cCBwcm9qZWN0aW9uL2JvdW5kaW5nIGJveCBpbml0aWFsbHlcclxuICAgICAgICAgICAgLy8gaWYgZXh0ZW50KCkgd2FzIGNhbGxlZCwgdGhpcyBzaG91bGQgaGF2ZSBzZXQgdXAgYm91bmRzLCBlbHNlIHdlIG5lZWQgdG8gZG8gaXQgaGVyZVxyXG4gICAgICAgICAgICAvLyBob3dldmVyLCBleHRlbnQoKSBjdXJyZW50bHkgb3BlcmF0ZXMgb24gdGhlIHJlbmRlcmVkIDxwYXRoPnMgZ2VuZXJhdGVkIGJ5IGRyYXcoKVxyXG4gICAgICAgICAgICAvLyBBbHNvOiBkcmF3IHNob3VsZCBiZSBjYWxsZWQgb25seSBhdCBlbmQgb2YgcHJvbWlzZSBjaGFpbiwgbm90IGluYmV0d2VlbiFcclxuICAgICAgICAgICAgLy90aGlzLl9wcm9taXNlLmdlb21ldHJ5LnRoZW4oZHJhdyk7XHJcbiAgICAgICAgICAgIG1hcC5kcmF3KCk7XHJcbiAgICAgICAgICAgIGlmIChvcHRpb25zLm9uZHJhdykgb3B0aW9ucy5vbmRyYXcoKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIHRoaXM7XHJcbiAgICB9XHJcblxyXG4gICAgdmFyIHByb21pc2UgPSBkZC5sb2FkKHNwZWMpO1xyXG5cclxuICAgIC8vIGNoYWluIHRvIGV4aXN0aW5nIGdlb21ldHJ5IHByb21pc2VcclxuICAgIGlmICh0aGlzLl9wcm9taXNlLmdlb21ldHJ5KSB7XHJcbiAgICAgICAgdmFyIHBhcmVudCA9IHRoaXMuX3Byb21pc2UuZ2VvbWV0cnk7XHJcbiAgICAgICAgdGhpcy5fcHJvbWlzZS5nZW9tZXRyeSA9IG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCkge1xyXG4gICAgICAgICAgICBwYXJlbnQudGhlbihmdW5jdGlvbihfKSB7XHJcbiAgICAgICAgICAgICAgICBwcm9taXNlLnRoZW4oZnVuY3Rpb24oZGF0YSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoZGF0YSk7XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcbiAgICBlbHNlIHtcclxuICAgICAgICB0aGlzLl9wcm9taXNlLmdlb21ldHJ5ID0gcHJvbWlzZTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgdGhpcy5fcHJvbWlzZS5nZW9tZXRyeS50aGVuKGZ1bmN0aW9uKGdlb20pIHtcclxuICAgICAgICBpZiAoZ2VvbS50eXBlICYmIGdlb20udHlwZSA9PSAnVG9wb2xvZ3knKSB7XHJcbiAgICAgICAgICAgIC8vIFRvcG9KU09OXHJcbiAgICAgICAgICAgIHZhciBrZXlzID0gb3B0aW9ucy5sYXllcnMgfHwgT2JqZWN0LmtleXMoZ2VvbS5vYmplY3RzKTtcclxuICAgICAgICAgICAga2V5cy5tYXAoZnVuY3Rpb24oaykge1xyXG4gICAgICAgICAgICAgICAgaWYgKGdlb20ub2JqZWN0c1trXSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHZhciBvYmpzID0gdG9wb2pzb24uZmVhdHVyZShnZW9tLCBnZW9tLm9iamVjdHNba10pLmZlYXR1cmVzO1xyXG4gICAgICAgICAgICAgICAgICAgIG1hcC5sYXllcnMucHVzaChrLCBvYmpzKTtcclxuXHRcdFx0XHRcdC8vIFRPRE86IHN1cHBvcnQgZnVuY3Rpb25zIGZvciBtYXAgYXMgd2VsbCBhcyBzdHJpbmdzXHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKG9wdGlvbnMua2V5KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvciAodmFyIGk9MDsgaTxvYmpzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YXIgb2JqID0gb2Jqc1tpXTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChvYmoucHJvcGVydGllcyAmJiBvYmoucHJvcGVydGllc1tvcHRpb25zLmtleV0pIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvYmpzW2ldLnByb3BlcnRpZXMuX19rZXlfXyA9IG9iai5wcm9wZXJ0aWVzW29wdGlvbnMua2V5XTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICAvLyBHZW9KU09OXHJcbiAgICAgICAgICAgIGlmICghb3B0aW9ucy5sYXllcnMpIHtcclxuICAgICAgICAgICAgICAgIG9wdGlvbnMubGF5ZXJzID0gJ2xheWVyLScgKyBsYXllcl9jb3VudGVyKys7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgaWYgKGdlb20uZmVhdHVyZXMpIHtcclxuICAgICAgICAgICAgICAgIG1hcC5sYXllcnMucHVzaChvcHRpb25zLmxheWVycywgZ2VvbS5mZWF0dXJlcyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgICAgICBtYXAubGF5ZXJzLnB1c2gob3B0aW9ucy5sYXllcnMsIFtnZW9tXSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gc2V0IHVwIHByb2plY3Rpb24gZmlyc3QgdG8gYXZvaWQgcmVwcm9qZWN0aW5nIGdlb21ldHJ5XHJcbiAgICAgICAgaWYgKG9wdGlvbnMuc2V0RXh0ZW50KSB7XHJcbiAgICAgICAgICAgIGlmICghbWFwLnNlbGVjdGVkX2V4dGVudCkge1xyXG4gICAgICAgICAgICAgICAgbWFwLl9leHRlbnQoZ2VvbSk7ICAgICAgICAgICBcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBUT0RPOiB3ZSBuZWVkIGEgc21hcnRlciB3YXkgb2Ygc2V0dGluZyB1cCBwcm9qZWN0aW9uL2JvdW5kaW5nIGJveCBpbml0aWFsbHlcclxuICAgICAgICAvLyBpZiBleHRlbnQoKSB3YXMgY2FsbGVkLCB0aGlzIHNob3VsZCBoYXZlIHNldCB1cCBib3VuZHMsIGVsc2Ugd2UgbmVlZCB0byBkbyBpdCBoZXJlXHJcbiAgICAgICAgLy8gaG93ZXZlciwgZXh0ZW50KCkgY3VycmVudGx5IG9wZXJhdGVzIG9uIHRoZSByZW5kZXJlZCA8cGF0aD5zIGdlbmVyYXRlZCBieSBkcmF3KClcclxuICAgICAgICAvL3RoaXMuX3Byb21pc2UuZ2VvbWV0cnkudGhlbihkcmF3KTtcclxuICAgICAgICBtYXAuZHJhdygpO1xyXG4gICAgICAgIGlmIChvcHRpb25zLm9uZHJhdykgb3B0aW9ucy5vbmRyYXcoKTtcclxuICAgIH0pO1xyXG4gICAgXHJcbiAgICAvLyBwdXQgaW50byBjaGFpbmVkIGRhdGEgcHJvbWlzZSB0byBtYWtlIHN1cmUgaXMgbG9hZGVkIGJlZm9yZSBsYXRlciBkYXRhXHJcbiAgICAvLyBub3RlIHRoaXMgaGFzIHRvIGhhcHBlbiBhZnRlciBtZXJnaW5nIGludG8gdGhpcy5fcHJvbWlzZS5nZW9tZXRyeSB0byBtYWtlXHJcbiAgICAvLyBzdXJlIGxheWVycyBhcmUgY3JlYXRlZCBmaXJzdCAoZS5nLiBmb3IgaGlnaGxpZ2h0aW5nKVxyXG4gICAgdGhpcy5wcm9taXNlX2RhdGEocHJvbWlzZSk7XHJcbiBcclxuICAgIHJldHVybiB0aGlzO1xyXG59O1xyXG5cclxudmFyIGlkZW50aWZ5X2J5X3Byb3BlcnRpZXMgPSBmdW5jdGlvbihwcm9wZXJ0aWVzKXtcclxuICAgIC8vIFRPRE86IGNhbGxpbmcgdGhpcyB3aXRob3V0IHByb3BlcnRpZXMgc2hvdWxkIHVzZSBwcmltYXJ5IGtleSBhcyBwcm9wZXJ0eVxyXG4gICAgLy8gaG93ZXZlciwgdGhpcyBpcyBub3Qgc3RvcmVkIGluIHRoZSBvYmplY3QncyBwcm9wZXJ0aWVzIGN1cnJlbnRseVxyXG4gICAgLy8gc28gdGhlcmUgaXMgbm8gZWFzeSB3YXkgdG8gYWNjZXNzIGl0XHJcbiAgICBpZiAoIXByb3BlcnRpZXMpIHtcclxuICAgICAgICBwcm9wZXJ0aWVzID0gJ19fa2V5X18nO1xyXG4gICAgfVxyXG4gICAgLy8gc2luZ2xlIHN0cmluZyBjYXNlXHJcbiAgICBpZiAocHJvcGVydGllcy5zdWJzdHIpIHtcclxuICAgICAgICBwcm9wZXJ0aWVzID0gW3Byb3BlcnRpZXNdO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIGZ1bmN0aW9uKGxheWVycywgbmFtZSl7XHJcbiAgICAgICAgbmFtZSA9IG5hbWUudG9TdHJpbmcoKS50b0xvd2VyQ2FzZSgpO1xyXG4gICAgICAgIC8vIGxheWVycyBoYXZlIHByaW9yaXR5LCBzbyBpdGVyYXRlIHRoZW0gZmlyc3RcclxuICAgICAgICB2YXIgbHlyID0gbGF5ZXJzLmdldChuYW1lKTtcclxuICAgICAgICBpZiAobHlyKSByZXR1cm4gbHlyO1xyXG4gICAgICAgIHZhciByZXN1bHQgPSBbXTtcclxuICAgICAgICAvLyBwcm9wZXJ0aWVzIGFyZSBvcmRlcmVkIGJ5IHJlbGV2YW5jZSwgc28gaXRlcmF0ZSB0aGVzZSBmaXJzdFxyXG4gICAgICAgIGZvciAodmFyIGs9MDsgazxwcm9wZXJ0aWVzLmxlbmd0aDsgaysrKSB7XHJcbiAgICAgICAgICAgIHZhciBwcm9wZXJ0eSA9IHByb3BlcnRpZXNba107XHJcbiAgICAgICAgICAgIGZvciAodmFyIGk9MDsgaTxsYXllcnMubGVuZ3RoKCk7IGkrKykge1xyXG4gICAgICAgICAgICAgICAgdmFyIGtleSA9IGxheWVycy5rZXlzKClbaV0sXHJcbiAgICAgICAgICAgICAgICAgICAgZ2VvbXMgPSBsYXllcnMuZ2V0KGtleSk7XHJcbiAgICAgICAgICAgICAgICBmb3IgKHZhciBqPTA7IGo8Z2VvbXMubGVuZ3RoOyBqKyspIHtcclxuICAgICAgICAgICAgICAgICAgICB2YXIgZ2VvbSA9IGdlb21zW2pdO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChnZW9tLnByb3BlcnRpZXMgJiYgZ2VvbS5wcm9wZXJ0aWVzW3Byb3BlcnR5XSAhPT0gdW5kZWZpbmVkICYmIGdlb20ucHJvcGVydGllc1twcm9wZXJ0eV0udG9TdHJpbmcoKS50b0xvd2VyQ2FzZSgpID09IG5hbWUpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0LnB1c2goZ2VvbSk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiByZXN1bHQ7XHJcbiAgICB9O1xyXG59O1xyXG5cclxudmFyIGlkZW50aWZ5X2xheWVyID0gZnVuY3Rpb24obGF5ZXJzLCBuYW1lKSB7XHJcbiAgICBuYW1lID0gbmFtZS50b0xvd2VyQ2FzZSgpO1xyXG4gICAgcmV0dXJuIGxheWVycy5nZXQobmFtZSk7XHJcbn07XHJcblxyXG4vLyBUT0RPOiB1c2UgYWxsIGFyZ3VtZW50cyB0byBpZGVudGlmeSAtIGNhbiBiZSB1c2VkIHRvIHByb3ZpZGUgbXVsdGlwbGUgcHJvcGVydGllcyBvciBmdW5jdGlvbnNcclxubWFwbWFwLnByb3RvdHlwZS5pZGVudGlmeSA9IGZ1bmN0aW9uKHNwZWMpIHtcclxuICAgIGlmICh0eXBlb2Ygc3BlYyA9PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgdGhpcy5pZGVudGlmeV9mdW5jID0gc3BlYztcclxuICAgICAgICByZXR1cm4gdGhpcztcclxuICAgIH1cclxuICAgIC8vIGNhc3QgdG8gYXJyYXlcclxuICAgIGlmICghc3BlYy5zbGljZSkge1xyXG4gICAgICAgIHNwZWMgPSBbc3BlY107XHJcbiAgICB9XHJcbiAgICB0aGlzLmlkZW50aWZ5X2Z1bmMgPSBpZGVudGlmeV9ieV9wcm9wZXJ0aWVzKHNwZWMpO1xyXG4gICAgcmV0dXJuIHRoaXM7XHJcbn07XHJcblxyXG5tYXBtYXAucHJvdG90eXBlLnNlYXJjaEFkYXB0ZXIgPSBmdW5jdGlvbihzZWxlY3Rpb24sIHByb3BOYW1lKSB7XHJcbiAgICB2YXIgbWFwID0gdGhpcztcclxuICAgIHJldHVybiBmdW5jdGlvbihxdWVyeSwgY2FsbGJhY2spIHtcclxuICAgICAgICBtYXAucHJvbWlzZV9kYXRhKCkudGhlbihmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgdmFyIHNlbCA9IG1hcC5nZXRSZXByZXNlbnRhdGlvbnMoc2VsZWN0aW9uKSxcclxuICAgICAgICAgICAgICAgIHJlc3VsdHMgPSBbXTtcclxuICAgICAgICAgICAgc2VsID0gc2VsWzBdO1xyXG4gICAgICAgICAgICBmb3IgKHZhciBpPTA7IGk8c2VsLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgICAgICB2YXIgZCA9IHNlbFtpXS5fX2RhdGFfXy5wcm9wZXJ0aWVzO1xyXG4gICAgICAgICAgICAgICAgaWYgKGRbcHJvcE5hbWVdICYmIGRbcHJvcE5hbWVdLnRvTG93ZXJDYXNlKCkuaW5kZXhPZihxdWVyeS50b0xvd2VyQ2FzZSgpKSA9PSAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0cy5wdXNoKHNlbFtpXS5fX2RhdGFfXyk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgY2FsbGJhY2socmVzdWx0cyk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9O1xyXG59O1xyXG5cclxuLy8gVE9ETzogdGhpcyBpcyBuZWVkZWQgZm9yIHNlYXJjaCBmdW5jdGlvbmFsaXR5IChzZWUgdG9vbHMuanMpIC0gZ2VuZXJhbGl6ZSBhbmQgaW50ZWdyYXRlXHJcbi8vIGludG8gaWRlbnRpZnkoKSBldGMuXHJcbm1hcG1hcC5wcm90b3R5cGUuc2VhcmNoID0gZnVuY3Rpb24odmFsdWUsIGtleSkge1xyXG4gICAga2V5ID0ga2V5IHx8ICdfX2tleV9fJztcclxuICAgIHJldHVybiBpZGVudGlmeV9ieV9wcm9wZXJ0aWVzKFtrZXldKSh0aGlzLmxheWVycywgdmFsdWUpO1xyXG59O1xyXG5cclxuLy8gcmV0dXJuIHRoZSByZXByZXNlbnRhdGlvbiAoPSBTVkcgZWxlbWVudCkgb2YgYSBnaXZlbiBvYmplY3RcclxubWFwbWFwLnByb3RvdHlwZS5yZXByID0gZnVuY3Rpb24oZCkge1xyXG4gICAgcmV0dXJuIGQuX19yZXByX187XHJcbn07XHJcblxyXG5cclxubWFwbWFwLnByb3RvdHlwZS5kcmF3ID0gZnVuY3Rpb24oKSB7XHJcblxyXG4gICAgdmFyIGdyb3VwU2VsID0gdGhpcy5fZWxlbWVudHMuZ2VvbWV0cnlcclxuICAgICAgICAuc2VsZWN0QWxsKCdnJylcclxuICAgICAgICAuZGF0YSh0aGlzLmxheWVycy5rZXlzKCksIGZ1bmN0aW9uKGQsaSkgeyByZXR1cm4gZDsgfSk7XHJcbiAgICBcclxuICAgIHZhciBtYXAgPSB0aGlzO1xyXG4gICAgXHJcbiAgICB2YXIgcGF0aEdlbmVyYXRvciA9IGQzLmdlby5wYXRoKCkucHJvamVjdGlvbih0aGlzLl9wcm9qZWN0aW9uKTtcclxuXHJcbiAgICBpZiAodGhpcy5fZWxlbWVudHMucGxhY2Vob2xkZXIpIHtcclxuICAgICAgICB0aGlzLl9lbGVtZW50cy5wbGFjZWhvbGRlci5yZW1vdmUoKTtcclxuICAgICAgICB0aGlzLl9lbGVtZW50cy5wbGFjZWhvbGRlciA9IG51bGw7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGdyb3VwU2VsLmVudGVyKClcclxuICAgICAgICAuYXBwZW5kKCdnJylcclxuICAgICAgICAuYXR0cignY2xhc3MnLCBmdW5jdGlvbihkKXtcclxuICAgICAgICAgICAgcmV0dXJuIGQ7XHJcbiAgICAgICAgfSlcclxuICAgICAgICAuZWFjaChmdW5jdGlvbihkKSB7XHJcbiAgICAgICAgICAgIC8vIGQgaXMgbmFtZSBvZiB0b3BvbG9neSBvYmplY3RcclxuICAgICAgICAgICAgdmFyIGdlb20gPSBtYXAubGF5ZXJzLmdldChkKTtcclxuICAgICAgICAgICAgdmFyIGdlb21TZWwgPSBkMy5zZWxlY3QodGhpcylcclxuICAgICAgICAgICAgICAgIC5zZWxlY3RBbGwoJ3BhdGgnKVxyXG4gICAgICAgICAgICAgICAgLmRhdGEoZ2VvbSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBnZW9tU2VsXHJcbiAgICAgICAgICAgICAgICAuZW50ZXIoKVxyXG4gICAgICAgICAgICAgICAgLmFwcGVuZCgncGF0aCcpXHJcbiAgICAgICAgICAgICAgICAuYXR0cignZCcsIHBhdGhHZW5lcmF0b3IpXHJcbiAgICAgICAgICAgICAgICAuYXR0cihtYXAuc2V0dGluZ3MucGF0aEF0dHJpYnV0ZXMpXHJcbiAgICAgICAgICAgICAgICAuZWFjaChmdW5jdGlvbihkKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gbGluayBkYXRhIG9iamVjdCB0byBpdHMgcmVwcmVzZW50YXRpb25cclxuICAgICAgICAgICAgICAgICAgICBkLl9fcmVwcl9fID0gdGhpcztcclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG4gICAgXHJcbiAgICBncm91cFNlbC5vcmRlcigpO1xyXG59O1xyXG5cclxubWFwbWFwLnByb3RvdHlwZS5hbmNob3JGdW5jdGlvbiA9IGZ1bmN0aW9uKGYpIHtcclxuICAgIHRoaXMuYW5jaG9yRiA9IGY7XHJcbiAgICByZXR1cm4gdGhpcztcclxufTtcclxuXHJcbm1hcG1hcC5wcm90b3R5cGUuYW5jaG9yID0gZnVuY3Rpb24oZCkge1xyXG4gICAgaWYgKHRoaXMuYW5jaG9yRikge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmFuY2hvckYoZCk7XHJcbiAgICB9XHJcbn07XHJcblxyXG5tYXBtYXAucHJvdG90eXBlLnNpemUgPSBmdW5jdGlvbigpIHtcclxuICAgIC8vIGJvdW5kcyBhcmUgcmUtY2FsY3VsYXRlIGJ5IGluaXRFdmVudHMgb24gZXZlcnkgcmVzaXplXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIHdpZHRoOiB0aGlzLndpZHRoLFxyXG4gICAgICAgIGhlaWdodDogdGhpcy5oZWlnaHRcclxuICAgIH07XHJcbn07XHJcblxyXG5cclxubWFwbWFwLnByb3RvdHlwZS5nZXRCb3VuZGluZ0NsaWVudFJlY3QgPSBmdW5jdGlvbigpIHtcclxuXHJcbiAgICB2YXIgZWwgPSB0aGlzLl9lbGVtZW50cy5tYWluLm5vZGUoKSxcclxuICAgICAgICBib3VuZHMgPSBlbC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcclxuICAgIFxyXG4gICAgaWYgKHRoaXMuc3VwcG9ydHMuc3ZnR2V0Qm91bmRpbmdDbGllbnRSZWN0KSB7XHJcbiAgICAgICAgcmV0dXJuIGJvdW5kcztcclxuICAgIH1cclxuICAgICAgICBcclxuICAgIC8vIEZpeCBnZXRCb3VuZGluZ0NsaWVudFJlY3QoKSBmb3IgRmlyZWZveCA8IDM1XHJcbiAgICAvLyBodHRwczovL2J1Z3ppbGxhLm1vemlsbGEub3JnL3Nob3dfYnVnLmNnaT9pZD01MzA5ODVcclxuICAgIC8vIGh0dHA6Ly9zdGFja292ZXJmbG93LmNvbS9xdWVzdGlvbnMvMjM2ODQ4MjEvY2FsY3VsYXRlLXNpemUtb2Ytc3ZnLWVsZW1lbnQtaW4taHRtbC1wYWdlXHJcbiAgICB2YXIgY3MgPSBnZXRDb21wdXRlZFN0eWxlKGVsKSxcclxuICAgICAgICBwYXJlbnRPZmZzZXQgPSBlbC5wYXJlbnROb2RlLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpLFxyXG4gICAgICAgIGxlZnQgPSBwYXJlbnRPZmZzZXQubGVmdCxcclxuICAgICAgICBzY3JvbGxUb3AgPSB3aW5kb3cucGFnZVlPZmZzZXQgfHwgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LnNjcm9sbFRvcCB8fCBkb2N1bWVudC5ib2R5LnNjcm9sbFRvcCB8fCAwLFxyXG4gICAgICAgIHNjcm9sbExlZnQgPSB3aW5kb3cucGFnZVhPZmZzZXQgfHwgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LnNjcm9sbExlZnQgfHwgZG9jdW1lbnQuYm9keS5zY3JvbGxMZWZ0IHx8IDBcclxuICAgIDtcclxuICAgIC8vIFRPRE86IHRha2UgaW50byBhY2NvdW50IG1hcmdpbnMgZXRjLlxyXG4gICAgaWYgKGNzLmxlZnQuaW5kZXhPZigncHgnKSA+IC0xKSB7XHJcbiAgICAgICAgbGVmdCArPSBwYXJzZUludChjcy5sZWZ0LnNsaWNlKDAsLTIpKTtcclxuICAgIH1cclxuICAgIC8vIHRoaXMgdGVzdHMgZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCkgdG8gYmUgbm9uLWJ1Z2d5XHJcbiAgICBpZiAoYm91bmRzLmxlZnQgPT0gbGVmdCAtIHNjcm9sbExlZnQpIHtcclxuICAgICAgICByZXR1cm4gYm91bmRzO1xyXG4gICAgfVxyXG4gICAgLy8gY29uc3RydWN0IHN5bnRoZXRpYyBib3VuZGluZ2JveCBmcm9tIGNvbXB1dGVkIHN0eWxlXHJcbiAgICB2YXIgdG9wID0gcGFyZW50T2Zmc2V0LnRvcCxcclxuICAgICAgICB3aWR0aCA9IHBhcnNlSW50KGNzLndpZHRoLnNsaWNlKDAsLTIpKSxcclxuICAgICAgICBoZWlnaHQgPSBwYXJzZUludChjcy5oZWlnaHQuc2xpY2UoMCwtMikpO1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICBsZWZ0OiBsZWZ0IC0gc2Nyb2xsTGVmdCxcclxuICAgICAgICB0b3A6IHRvcCAtIHNjcm9sbFRvcCxcclxuICAgICAgICB3aWR0aDogd2lkdGgsXHJcbiAgICAgICAgaGVpZ2h0OiBoZWlnaHQsXHJcbiAgICAgICAgcmlnaHQ6IGxlZnQgKyB3aWR0aCAtIHNjcm9sbExlZnQsXHJcbiAgICAgICAgYm90dG9tOiB0b3AgKyBoZWlnaHQgLSBzY3JvbGxUb3BcclxuICAgIH07XHJcbn07XHJcblxyXG4vLyBUT0RPOiBkaXNhYmxlIHBvaW50ZXItZXZlbnRzIGZvciBub3Qgc2VsZWN0ZWQgcGF0aHNcclxubWFwbWFwLnByb3RvdHlwZS5zZWxlY3QgPSBmdW5jdGlvbihzZWxlY3Rpb24pIHtcclxuXHJcbiAgICB2YXIgbWFwID0gdGhpcztcclxuICAgIFxyXG4gICAgZnVuY3Rpb24gZ2V0TmFtZShzZWwpIHtcclxuICAgICAgICByZXR1cm4gKHR5cGVvZiBzZWwgPT0gJ3N0cmluZycpID8gc2VsIDogKHNlbC5zZWxlY3Rpb25OYW1lIHx8ICdmdW5jdGlvbicpO1xyXG4gICAgfVxyXG4gICAgdmFyIG9sZFNlbCA9IHRoaXMuc2VsZWN0ZWQ7XHJcbiAgICBpZiAodGhpcy5zZWxlY3RlZCkge1xyXG4gICAgICAgIHRoaXMuX2VsZW1lbnRzLm1haW4uY2xhc3NlZCgnc2VsZWN0ZWQtJyArIGdldE5hbWUodGhpcy5zZWxlY3RlZCksIGZhbHNlKTtcclxuICAgIH1cclxuICAgIHRoaXMuc2VsZWN0ZWQgPSBzZWxlY3Rpb247XHJcbiAgICBpZiAodGhpcy5zZWxlY3RlZCkge1xyXG4gICAgICAgIHRoaXMuX2VsZW1lbnRzLm1haW4uY2xhc3NlZCgnc2VsZWN0ZWQtJyArIGdldE5hbWUodGhpcy5zZWxlY3RlZCksIHRydWUpO1xyXG4gICAgfVxyXG4gICAgdGhpcy5wcm9taXNlX2RhdGEoKS50aGVuKGZ1bmN0aW9uKCl7XHJcbiAgICAgICAgaWYgKG9sZFNlbCkge1xyXG4gICAgICAgICAgICBtYXAuZ2V0UmVwcmVzZW50YXRpb25zKG9sZFNlbCkuY2xhc3NlZCgnc2VsZWN0ZWQnLGZhbHNlKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKHNlbGVjdGlvbikge1xyXG4gICAgICAgICAgICBtYXAuZ2V0UmVwcmVzZW50YXRpb25zKHNlbGVjdGlvbikuY2xhc3NlZCgnc2VsZWN0ZWQnLHRydWUpO1xyXG4gICAgICAgIH1cclxuICAgIH0pO1xyXG4gICAgcmV0dXJuIHRoaXM7XHJcbn07XHJcblxyXG5tYXBtYXAucHJvdG90eXBlLmhpZ2hsaWdodCA9IGZ1bmN0aW9uKHNlbGVjdGlvbikge1xyXG5cclxuICAgIHZhciBtYXAgPSB0aGlzO1xyXG4gICAgICAgXHJcbiAgICBpZiAoc2VsZWN0aW9uID09PSBudWxsKSB7XHJcbiAgICAgICAgbWFwLl9lbGVtZW50cy5zaGFkb3dFbC5zZWxlY3RBbGwoJ3BhdGgnKS5yZW1vdmUoKTtcclxuICAgICAgICBtYXAuX2VsZW1lbnRzLnNoYWRvd0Nyb3BFbC5zZWxlY3RBbGwoJ3BhdGgnKS5yZW1vdmUoKTtcclxuICAgIH1cclxuICAgIGVsc2Uge1xyXG4gICAgICAgIHRoaXMucHJvbWlzZV9kYXRhKCkudGhlbihmdW5jdGlvbihkYXRhKSB7ICAgICAgXHJcbiAgICAgICAgICAgIHZhciBvYmogPSBtYXAuZ2V0UmVwcmVzZW50YXRpb25zKHNlbGVjdGlvbik7XHJcbiAgICAgICAgICAgIG1hcC5fZWxlbWVudHMuc2hhZG93RWwuc2VsZWN0QWxsKCdwYXRoJykucmVtb3ZlKCk7XHJcbiAgICAgICAgICAgIG1hcC5fZWxlbWVudHMuc2hhZG93Q3JvcEVsLnNlbGVjdEFsbCgncGF0aCcpLnJlbW92ZSgpO1xyXG4gICAgICAgICAgICBvYmouZWFjaChmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgICAgIG1hcC5fZWxlbWVudHMuc2hhZG93RWwuYXBwZW5kKCdwYXRoJylcclxuICAgICAgICAgICAgICAgICAgICAuYXR0cih7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGQ6IHRoaXMuYXR0cmlidXRlcy5kLnZhbHVlLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBmaWxsOiAncmdiYSgwLDAsMCwwLjUpJyAvLycjOTk5J1xyXG4gICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgbWFwLl9lbGVtZW50cy5zaGFkb3dDcm9wRWwuYXBwZW5kKCdwYXRoJylcclxuICAgICAgICAgICAgICAgICAgICAuYXR0cih7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGQ6IHRoaXMuYXR0cmlidXRlcy5kLnZhbHVlLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBmaWxsOiAnI2ZmZidcclxuICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gdGhpcztcclxufTtcclxuXHJcbi8qXHJcbkNhbGwgd2l0aG91dCBwYXJhbWV0ZXJzIHRvIGdldCBjdXJyZW50IHNlbGVjdGlvbi5cclxuQ2FsbCB3aXRoIG51bGwgdG8gZ2V0IGFsbCB0b3BvbG9neSBvYmplY3RzLlxyXG5DYWxsIHdpdGggZnVuY3Rpb24gdG8gZmlsdGVyIGdlb21ldHJpZXMuXHJcbkNhbGwgd2l0aCBzdHJpbmcgdG8gZmlsdGVyIGdlb21ldHJpZXMvbGF5ZXJzIGJhc2VkIG9uIGlkZW50aWZ5KCkuXHJcbkNhbGwgd2l0aCBnZW9tZXRyeSB0byBjb252ZXJ0IGludG8gZDMgc2VsZWN0aW9uLlxyXG5cclxuUmV0dXJucyBhIEQzIHNlbGVjdGlvbi5cclxuKi9cclxubWFwbWFwLnByb3RvdHlwZS5nZXRSZXByZXNlbnRhdGlvbnMgPSBmdW5jdGlvbihzZWxlY3Rpb24pIHtcclxuICAgIGlmICh0eXBlb2Ygc2VsZWN0aW9uID09ICd1bmRlZmluZWQnKSB7XHJcbiAgICAgICAgc2VsZWN0aW9uID0gdGhpcy5zZWxlY3RlZDtcclxuICAgIH1cclxuICAgIGlmIChzZWxlY3Rpb24pIHtcclxuICAgICAgICBpZiAodHlwZW9mIHNlbGVjdGlvbiA9PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9lbGVtZW50cy5nZW9tZXRyeS5zZWxlY3RBbGwoJ3BhdGgnKS5maWx0ZXIoZnVuY3Rpb24oZCxpKXtcclxuICAgICAgICAgICAgICAgIHJldHVybiBzZWxlY3Rpb24oZC5wcm9wZXJ0aWVzKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChzZWxlY3Rpb24uX19kYXRhX18pIHtcclxuICAgICAgICAgICAgLy8gaXMgYSBnZW9tZXRyeSBnZW5lcmF0ZWQgYnkgZDMgLT4gcmV0dXJuIHNlbGVjdGlvblxyXG4gICAgICAgICAgICByZXR1cm4gZDMuc2VsZWN0KHNlbGVjdGlvbik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIFRPRE86IHRoaXMgc2hvdWxkIGhhdmUgYSBuaWNlciBBUElcclxuICAgICAgICB2YXIgb2JqID0gdGhpcy5pZGVudGlmeV9mdW5jKHRoaXMubGF5ZXJzLCBzZWxlY3Rpb24pO1xyXG4gICAgICAgIGlmICghb2JqKSByZXR1cm4gZDMuc2VsZWN0KG51bGwpO1xyXG4gICAgICAgIC8vIGxheWVyIGNhc2VcclxuICAgICAgICBpZiAob2JqLmxlbmd0aCkge1xyXG4gICAgICAgICAgICByZXR1cm4gZDMuc2VsZWN0QWxsKG9iai5tYXAoZnVuY3Rpb24oZCl7cmV0dXJuIGQuX19yZXByX187fSkpO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBvYmplY3QgY2FzZVxyXG4gICAgICAgIHJldHVybiBkMy5zZWxlY3Qob2JqLl9fcmVwcl9fKTtcclxuICAgIH1cclxuICAgIHJldHVybiB0aGlzLl9lbGVtZW50cy5nZW9tZXRyeS5zZWxlY3RBbGwoJ3BhdGgnKTtcclxufTtcclxuXHJcbi8vIFRPRE86IHRoaXMgaXMgYW4gdWdseSBoYWNrIGZvciBub3csIHVudGlsIHdlIHByb3Blcmx5IGtlZXAgdHJhY2sgb2YgY3VycmVudCBtZXJnZWQgZGF0YSFcclxubWFwbWFwLnByb3RvdHlwZS5nZXREYXRhID0gZnVuY3Rpb24oa2V5LCBzZWxlY3Rpb24pIHtcclxuXHJcbiAgICB2YXIgbWFwID0gdGhpcztcclxuICAgIFxyXG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKGZ1bmN0aW9uKHJlc29sdmUsIHJlamVjdCkge1xyXG4gICAgICAgIG1hcC5fcHJvbWlzZS5kYXRhLnRoZW4oZnVuY3Rpb24oZGF0YSkge1xyXG4gICAgICAgIFxyXG4gICAgICAgICAgICBkYXRhID0gZGQuT3JkZXJlZEhhc2goKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIG1hcC5nZXRSZXByZXNlbnRhdGlvbnMoc2VsZWN0aW9uKVswXS5mb3JFYWNoKGZ1bmN0aW9uKGQpe1xyXG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBkLl9fZGF0YV9fLnByb3BlcnRpZXNba2V5XSAhPSAndW5kZWZpbmVkJykge1xyXG4gICAgICAgICAgICAgICAgICAgIGRhdGEucHVzaChkLl9fZGF0YV9fLnByb3BlcnRpZXNba2V5XSwgZC5fX2RhdGFfXy5wcm9wZXJ0aWVzKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICByZXNvbHZlKGRhdGEpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfSk7XHJcbn07XHJcblxyXG5tYXBtYXAucHJvdG90eXBlLmdldE92ZXJsYXlDb250ZXh0ID0gZnVuY3Rpb24oKSB7XHJcbiAgICByZXR1cm4gdGhpcy5fZWxlbWVudHMub3ZlcmxheTtcclxufTtcclxuXHJcbm1hcG1hcC5wcm90b3R5cGUucHJvamVjdCA9IGZ1bmN0aW9uKHBvaW50KSB7XHJcbiAgICByZXR1cm4gdGhpcy5fcHJvamVjdGlvbihwb2ludCk7XHJcbn07XHJcblxyXG5cclxubWFwbWFwLnByb3RvdHlwZS5wcm9taXNlX2RhdGEgPSBmdW5jdGlvbihwcm9taXNlKSB7XHJcbiAgICAvLyBjaGFpbiBhIG5ldyBwcm9taXNlIHRvIHRoZSBkYXRhIHByb21pc2VcclxuICAgIC8vIHRoaXMgYWxsb3dzIGEgbW9yZSBlbGVnYW50IEFQSSB0aGFuIFByb21pc2UuYWxsKFtwcm9taXNlc10pXHJcbiAgICAvLyBzaW5jZSB3ZSB1c2Ugb25seSBhIHNpbmdsZSBwcm9taXNlIHRoZSBcImVuY2Fwc3VsYXRlc1wiIHRoZVxyXG4gICAgLy8gcHJldmlvdXMgb25lc1xyXG4gICAgXHJcbiAgICAvLyBUT0RPOiBoaWRlIHRoaXMuX3Byb21pc2UuZGF0YSB0aHJvdWdoIGEgY2xvc3VyZT9cclxuICAgIFxyXG4gICAgLy8gVE9ETzogd2Ugb25seSBmdWxmaWxsIHdpdGggbW9zdCByZWNlbnQgZGF0YSAtIHNob3VsZFxyXG4gICAgLy8gd2Ugbm90ICphbHdheXMqIGZ1bGZpbGwgd2l0aCBjYW5vbmljYWwgZGF0YSBpLmUuIHRoZVxyXG4gICAgLy8gdW5kZXJseWluZyBzZWxlY3Rpb24sIG9yIGtlZXAgY2Fub25pY2FsIGRhdGEgYW5kIHJlZnJlc2hcclxuICAgIC8vIHNlbGVjdGlvbiBhbHdheXM/XHJcbiAgICAvLyBBbHNvLCB3ZSBuZWVkIHRvIGtlZXAgZGF0YSB0aGF0IGhhcyBubyBlbnRpdGllcyBpbiB0aGUgZ2VvbWV0cnlcclxuICAgIC8vIGUuZy4gZm9yIGxvYWRpbmcgc3RhdHMgb2YgYWdncmVnYXRlZCBlbnRpdGllcy4gV2UgY291bGRcclxuICAgIC8vIHVzZSBhIGdsb2JhbCBhcnJheSBvZiBHZW9KU09OIGZlYXR1cmVzLCBhcyB0aGlzIGFsbG93c1xyXG4gICAgLy8gZWl0aGVyIGdlb21ldHJ5IG9yIHByb3BlcnRpZXMgdG8gYmUgbnVsbCAtLSBmbCAyMDE1LTExLTIxXHJcblxyXG4gICAgdmFyIG1hcCA9IHRoaXM7XHJcbiAgICBcclxuICAgIGlmIChwcm9taXNlKSB7XHJcbiAgICAgICAgaWYgKHRoaXMuX3Byb21pc2UuZGF0YSkge1xyXG4gICAgICAgICAgICB0aGlzLl9wcm9taXNlLmRhdGEgPSBuZXcgUHJvbWlzZShmdW5jdGlvbihyZXNvbHZlLCByZWplY3QpIHtcclxuICAgICAgICAgICAgICAgIG1hcC5fcHJvbWlzZS5kYXRhLnRoZW4oZnVuY3Rpb24oXykge1xyXG4gICAgICAgICAgICAgICAgICAgIHByb21pc2UudGhlbihmdW5jdGlvbihkYXRhKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlc29sdmUoZGF0YSk7XHJcbiAgICAgICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICB0aGlzLl9wcm9taXNlLmRhdGEgPSBwcm9taXNlO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIHJldHVybiB0aGlzLl9wcm9taXNlLmRhdGE7ICAgXHJcbn07XHJcblxyXG5tYXBtYXAucHJvdG90eXBlLnRoZW4gPSBmdW5jdGlvbihjYWxsYmFjaykge1xyXG4gICAgdGhpcy5wcm9taXNlX2RhdGEoKS50aGVuKGNhbGxiYWNrKTtcclxuICAgIHJldHVybiB0aGlzO1xyXG59O1xyXG5cclxuLy8gVE9ETzogdGhpbmsgYWJvdXQgY2FjaGluZyBsb2FkZWQgcmVzb3VyY2VzICgjOClcclxubWFwbWFwLnByb3RvdHlwZS5kYXRhID0gZnVuY3Rpb24oc3BlYywga2V5T3JPcHRpb25zKSB7XHJcblxyXG4gICAgdmFyIG9wdGlvbnMgPSBkZC5pc0RpY3Rpb25hcnkoa2V5T3JPcHRpb25zKSA/IGtleU9yT3B0aW9ucyA6IHttYXA6IGtleU9yT3B0aW9uc307XHJcbiAgICBcclxuICAgIG9wdGlvbnMgPSBkZC5tZXJnZSh7XHJcbiAgICAgICAgZ2VvbWV0cnlLZXk6ICdfX2tleV9fJyAvLyBuYXR1cmFsIGtleVxyXG4gICAgICAgIC8vIG1hcDogZGF0ZGF0YSBkZWZhdWx0XHJcbiAgICAgICAgLy8gcmVkdWNlOiBkYXRkYXRhIGRlZmF1bHRcclxuICAgIH0sIG9wdGlvbnMpO1xyXG4gICAgICAgIFxyXG4gICAgdmFyIG1hcCA9IHRoaXM7XHJcbiAgICBcclxuICAgIGlmICh0eXBlb2Ygc3BlYyA9PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgdGhpcy5wcm9taXNlX2RhdGEoKS50aGVuKGZ1bmN0aW9uKGRhdGEpe1xyXG4gICAgICAgICAgICAvLyBUT0RPOiB0aGlzIGlzIGEgbWVzcywgc2VlIGFib3ZlIC0gZGF0YVxyXG4gICAgICAgICAgICAvLyBkb2Vzbid0IGNvbnRhaW4gdGhlIGFjdHVhbCBjYW5vbmljYWwgZGF0YSwgYnV0IFxyXG4gICAgICAgICAgICAvLyBvbmx5IHRoZSBtb3N0IHJlY2VudGx5IHJlcXVlc3RlZCBvbmUsIHdoaWNoIGRvZXNuJ3RcclxuICAgICAgICAgICAgLy8gaGVscCB1cyBmb3IgdHJhbnNmb3JtYXRpb25zXHJcbiAgICAgICAgICAgIG1hcC5fZWxlbWVudHMuZ2VvbWV0cnkuc2VsZWN0QWxsKCdwYXRoJylcclxuICAgICAgICAgICAgLmVhY2goZnVuY3Rpb24oZ2VvbSkge1xyXG4gICAgICAgICAgICAgICAgaWYgKGdlb20ucHJvcGVydGllcykge1xyXG4gICAgICAgICAgICAgICAgICAgIHZhciB2YWwgPSBzcGVjKGdlb20ucHJvcGVydGllcyk7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHZhbCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBtYXBtYXAuZXh0ZW5kKGdlb20ucHJvcGVydGllcywgdmFsKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG4gICAgZWxzZSB7XHJcbiAgICAgICAgdGhpcy5wcm9taXNlX2RhdGEoZGQoc3BlYywgb3B0aW9ucy5tYXAsIG9wdGlvbnMucmVkdWNlLCBvcHRpb25zKSlcclxuICAgICAgICAudGhlbihmdW5jdGlvbihkYXRhKSB7XHJcbiAgICAgICAgICAgIGlmIChkYXRhLmxlbmd0aCgpID09IDApIHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybihcIkRhdGEgZm9yIGtleSAnXCIgKyBvcHRpb25zLm1hcCArIFwiJyB5aWVsZGVkIG5vIHJlc3VsdHMhXCIpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIG1hcC5fZWxlbWVudHMuZ2VvbWV0cnkuc2VsZWN0QWxsKCdwYXRoJylcclxuICAgICAgICAgICAgICAgIC5lYWNoKGZ1bmN0aW9uKGQpIHtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoZC5wcm9wZXJ0aWVzKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBrID0gZC5wcm9wZXJ0aWVzW29wdGlvbnMuZ2VvbWV0cnlLZXldO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoaykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbWFwbWFwLmV4dGVuZChkLnByb3BlcnRpZXMsIGRhdGEuZ2V0KGspKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vY29uc29sZS53YXJuKFwiS2V5ICdcIiArIG9wdGlvbnMuZ2VvbWV0cnlLZXkgKyBcIicgbm90IGZvdW5kIGluIFwiICsgdGhpcyArIFwiIVwiKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfSAgICBcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuICAgIHJldHVybiB0aGlzO1xyXG59O1xyXG5cclxudmFyIE1ldGFEYXRhU3BlYyA9IGZ1bmN0aW9uKGtleSwgZmllbGRzKSB7XHJcbiAgICAvLyBlbnN1cmUgY29uc3RydWN0b3IgaW52b2NhdGlvblxyXG4gICAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIE1ldGFEYXRhU3BlYykpIHJldHVybiBuZXcgTWV0YURhdGFTcGVjKGtleSwgZmllbGRzKTtcclxuICAgIG1hcG1hcC5leHRlbmQodGhpcywgZmllbGRzKTtcclxuICAgIHRoaXMua2V5ID0ga2V5O1xyXG4gICAgcmV0dXJuIHRoaXM7XHJcbn07XHJcbk1ldGFEYXRhU3BlYy5wcm90b3R5cGUuc3BlY2lmaWNpdHkgPSBmdW5jdGlvbigpIHtcclxuICAgIC8vIHJlZ2V4IGNhc2UuIHVzZSBsZW5ndGggb2Ygc3RyaW5nIHJlcHJlc2VudGF0aW9uIHdpdGhvdXQgZW5jbG9zaW5nIC8uLi4vXHJcbiAgICBpZiAodGhpcy5rZXkgaW5zdGFuY2VvZiBSZWdFeHApIHJldHVybiB0aGlzLmtleS50b1N0cmluZygpLTI7XHJcbiAgICAvLyByZXR1cm4gbnVtYmVyIG9mIHNpZ25pZmljYW50IGxldHRlcnNcclxuICAgIHJldHVybiB0aGlzLmtleS5sZW5ndGggLSAodGhpcy5rZXkubWF0Y2goL1tcXCpcXD9dL2cpIHx8IFtdKS5sZW5ndGg7XHJcbn07XHJcbk1ldGFEYXRhU3BlYy5wcm90b3R5cGUubWF0Y2ggPSBmdW5jdGlvbihzdHIpIHtcclxuICAgIGlmICh0aGlzLmtleSBpbnN0YW5jZW9mIFJlZ0V4cCkgcmV0dXJuIChzdHIuc2VhcmNoKHRoaXMua2V5KSA9PSAwKTtcclxuICAgIHZhciByZXggPSBuZXcgUmVnRXhwKCdeJyArIHRoaXMua2V5LnJlcGxhY2UoJyonLCcuKicpLnJlcGxhY2UoJz8nLCcuJykpO1xyXG4gICAgcmV0dXJuIChzdHIuc2VhcmNoKHJleCkgPT0gMCk7XHJcbn07XHJcbnZhciBNZXRhRGF0YSA9IGZ1bmN0aW9uKGZpZWxkcywgbG9jYWxlUHJvdmlkZXIpIHtcclxuICAgIC8vIGVuc3VyZSBjb25zdHJ1Y3RvciBpbnZvY2F0aW9uXHJcbiAgICBpZiAoISh0aGlzIGluc3RhbmNlb2YgTWV0YURhdGEpKSByZXR1cm4gbmV3IE1ldGFEYXRhKGZpZWxkcywgbG9jYWxlUHJvdmlkZXIpO1xyXG4gICAgbWFwbWFwLmV4dGVuZCh0aGlzLCBmaWVsZHMpO1xyXG4gICAgLy8gdGFrZSBkZWZhdWx0IGZyb20gbG9jYWxlXHJcbiAgICBpZiAoIXRoaXMudW5kZWZpbmVkTGFiZWwpIHRoaXMudW5kZWZpbmVkTGFiZWwgPSBsb2NhbGVQcm92aWRlci5sb2NhbGUudW5kZWZpbmVkTGFiZWw7XHJcbiAgICBcclxuICAgIHRoaXMuZm9ybWF0ID0gZnVuY3Rpb24odmFsKSB7XHJcbiAgICAgICAgaWYgKCF0aGlzLl9mb3JtYXQpIHtcclxuICAgICAgICAgICAgdGhpcy5fZm9ybWF0ID0gdGhpcy5nZXRGb3JtYXR0ZXIoKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgLy8gcmV0dXJuIHVuZGVmaW5lZCBpZiB1bmRlZmluZWQgb3IgaWYgbm90IGEgbnVtYmVyIGJ1dCBudW1iZXIgZm9ybWF0dGluZyBleHBsaWNpdGx5IHJlcXVlc3RlZFxyXG4gICAgICAgIGlmICh2YWwgPT09IHVuZGVmaW5lZCB8fCB2YWwgPT09IG51bGwgfHwgKHRoaXMubnVtYmVyRm9ybWF0ICYmIChpc05hTih2YWwpKSkpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMudW5kZWZpbmVkVmFsdWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiB0aGlzLl9mb3JtYXQodmFsKTtcclxuICAgIH07XHJcbiAgICB0aGlzLmdldEZvcm1hdHRlciA9IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIGlmICh0aGlzLnNjYWxlID09ICdvcmRpbmFsJyAmJiB0aGlzLnZhbHVlTGFiZWxzKSB7XHJcbiAgICAgICAgICAgIHZhciBzY2FsZSA9IGQzLnNjYWxlLm9yZGluYWwoKS5kb21haW4odGhpcy5kb21haW4pLnJhbmdlKHRoaXMudmFsdWVMYWJlbHMpO1xyXG4gICAgICAgICAgICByZXR1cm4gc2NhbGU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmICh0aGlzLm51bWJlckZvcm1hdCAmJiB0eXBlb2YgdGhpcy5udW1iZXJGb3JtYXQgPT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5udW1iZXJGb3JtYXQ7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChsb2NhbGVQcm92aWRlci5sb2NhbGUpIHtcclxuICAgICAgICAgICAgcmV0dXJuIGxvY2FsZVByb3ZpZGVyLmxvY2FsZS5udW1iZXJGb3JtYXQodGhpcy5udW1iZXJGb3JtYXQgfHwgJy4wMWYnKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIGQzLmZvcm1hdCh0aGlzLm51bWJlckZvcm1hdCB8fCAnLjAxZicpO1xyXG4gICAgfTtcclxuICAgIHRoaXMuZ2V0UmFuZ2VGb3JtYXR0ZXIgPSBmdW5jdGlvbigpIHtcclxuICAgICAgICB2YXIgZm10ID0gdGhpcy5mb3JtYXQuYmluZCh0aGlzKTtcclxuICAgICAgICByZXR1cm4gZnVuY3Rpb24obG93ZXIsIHVwcGVyLCBleGNsdWRlTG93ZXIsIGV4Y2x1ZGVVcHBlcikge1xyXG4gICAgICAgICAgICBpZiAobG9jYWxlUHJvdmlkZXIubG9jYWxlICYmIGxvY2FsZVByb3ZpZGVyLmxvY2FsZS5yYW5nZUxhYmVsKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gbG9jYWxlUHJvdmlkZXIubG9jYWxlLnJhbmdlTGFiZWwobG93ZXIsIHVwcGVyLCBmbXQsIGV4Y2x1ZGVMb3dlciwgZXhjbHVkZVVwcGVyKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICByZXR1cm4gZGVmYXVsdFJhbmdlTGFiZWwobG93ZXIsIHVwcGVyLCBmbXQsIGV4Y2x1ZGVMb3dlciwgZXhjbHVkZVVwcGVyKTtcclxuICAgICAgICB9XHJcbiAgICB9O1xyXG4gICAgcmV0dXJuIHRoaXM7XHJcbn07XHJcblxyXG5tYXBtYXAucHJvdG90eXBlLm1ldGEgPSBmdW5jdGlvbihtZXRhZGF0YSl7XHJcbiAgICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKG1ldGFkYXRhKTtcclxuICAgIGZvciAodmFyIGk9MDsgaTxrZXlzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgdGhpcy5tZXRhZGF0YV9zcGVjcy5wdXNoKE1ldGFEYXRhU3BlYyhrZXlzW2ldLCBtZXRhZGF0YVtrZXlzW2ldXSkpO1xyXG4gICAgfVxyXG4gICAgdGhpcy5tZXRhZGF0YV9zcGVjcy5zb3J0KGZ1bmN0aW9uKGEsYikge1xyXG4gICAgICAgIHJldHVybiBhLnNwZWNpZmljaXR5KCktYi5zcGVjaWZpY2l0eSgpO1xyXG4gICAgfSk7XHJcbiAgICByZXR1cm4gdGhpcztcclxufTtcclxuXHJcbm1hcG1hcC5wcm90b3R5cGUuZ2V0TWV0YWRhdGEgPSBmdW5jdGlvbihrZXkpIHtcclxuICAgIGlmICghdGhpcy5tZXRhZGF0YSkge1xyXG4gICAgICAgIHRoaXMubWV0YWRhdGEgPSB7fTtcclxuICAgIH1cclxuICAgIGlmICghdGhpcy5tZXRhZGF0YVtrZXldKSB7XHJcbiAgICAgICAgdmFyIGZpZWxkcyA9IG1hcG1hcC5leHRlbmQoe30sIHRoaXMuc2V0dGluZ3MuZGVmYXVsdE1ldGFkYXRhKTtcclxuICAgICAgICBmb3IgKHZhciBpPTA7IGk8dGhpcy5tZXRhZGF0YV9zcGVjcy5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICBpZiAodGhpcy5tZXRhZGF0YV9zcGVjc1tpXS5tYXRjaChrZXkpKSB7XHJcbiAgICAgICAgICAgICAgICBtYXBtYXAuZXh0ZW5kKGZpZWxkcywgdGhpcy5tZXRhZGF0YV9zcGVjc1tpXSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5tZXRhZGF0YVtrZXldID0gTWV0YURhdGEoZmllbGRzLCB0aGlzKTtcclxuICAgIH1cclxuICAgIHJldHVybiB0aGlzLm1ldGFkYXRhW2tleV07XHJcbn07XHJcblxyXG5mdW5jdGlvbiBnZXRTdGF0cyhkYXRhLCB2YWx1ZUZ1bmMpIHtcclxuICAgIHZhciBzdGF0cyA9IHtcclxuICAgICAgICBjb3VudDogMCxcclxuICAgICAgICBjb3VudE51bWJlcnM6IDAsXHJcbiAgICAgICAgYW55TmVnYXRpdmU6IGZhbHNlLFxyXG4gICAgICAgIGFueVBvc2l0aXZlOiBmYWxzZSxcclxuICAgICAgICBhbnlTdHJpbmdzOiBmYWxzZSxcclxuICAgICAgICBtaW46IHVuZGVmaW5lZCxcclxuICAgICAgICBtYXg6IHVuZGVmaW5lZFxyXG4gICAgfTtcclxuICAgIGZ1bmN0aW9uIGRhdHVtRnVuYyhkKSB7XHJcbiAgICAgICAgdmFyIHZhbCA9IHZhbHVlRnVuYyhkKTtcclxuICAgICAgICBpZiAodmFsICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgc3RhdHMuY291bnQgKz0gMTtcclxuICAgICAgICAgICAgaWYgKGRkLmlzTnVtZXJpYyh2YWwpKSB7XHJcbiAgICAgICAgICAgICAgICB2YWwgPSArdmFsO1xyXG4gICAgICAgICAgICAgICAgc3RhdHMuY291bnROdW1iZXJzICs9IDE7XHJcbiAgICAgICAgICAgICAgICBpZiAoc3RhdHMubWluID09PSB1bmRlZmluZWQpIHN0YXRzLm1pbiA9IHZhbDtcclxuICAgICAgICAgICAgICAgIGlmIChzdGF0cy5tYXggPT09IHVuZGVmaW5lZCkgc3RhdHMubWF4ID0gdmFsO1xyXG4gICAgICAgICAgICAgICAgaWYgKHZhbCA8IHN0YXRzLm1pbikgc3RhdHMubWluID0gdmFsO1xyXG4gICAgICAgICAgICAgICAgaWYgKHZhbCA+IHN0YXRzLm1heCkgc3RhdHMubWF4ID0gdmFsO1xyXG4gICAgICAgICAgICAgICAgaWYgKHZhbCA+IDApIHN0YXRzLmFueVBvc2l0aXZlID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgIGlmICh2YWwgPCAwKSBzdGF0cy5hbnlOZWdhdGl2ZSA9IHRydWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgZWxzZSBpZiAodmFsKSB7XHJcbiAgICAgICAgICAgICAgICBzdGF0cy5hbnlTdHJpbmcgPSB0cnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgaWYgKGRhdGEuZWFjaCAmJiB0eXBlb2YgZGF0YS5lYWNoID09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICBkYXRhLmVhY2goZGF0dW1GdW5jKTtcclxuICAgIH1cclxuICAgIGVsc2Uge1xyXG4gICAgICAgIGZvciAodmFyIGk9MDsgaTxkYXRhLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgIGRhdHVtRnVuYyhkYXRhW2ldKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICByZXR1cm4gc3RhdHM7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHByb3BlcnRpZXNfYWNjZXNzb3IoZnVuYykge1xyXG4gICAgLy8gY29udmVydHMgYSBkYXRhIGNhbGxiYWNrIGZ1bmN0aW9uIHRvIGFjY2VzcyBkYXRhJ3MgLnByb3BlcnRpZXMgZW50cnlcclxuICAgIC8vIHVzZWZ1bCBmb3IgcHJvY2Vzc2luZyBnZW9qc29uIG9iamVjdHNcclxuICAgIHJldHVybiBmdW5jdGlvbihkYXRhKSB7XHJcbiAgICAgICAgaWYgKGRhdGEucHJvcGVydGllcykgcmV0dXJuIGZ1bmMoZGF0YS5wcm9wZXJ0aWVzKTtcclxuICAgIH07XHJcbn1cclxuXHJcbm1hcG1hcC5wcm90b3R5cGUuYXV0b0NvbG9yU2NhbGUgPSBmdW5jdGlvbih2YWx1ZSwgbWV0YWRhdGEsIHNlbGVjdGlvbikge1xyXG4gICAgXHJcbiAgICBpZiAoIW1ldGFkYXRhKSB7XHJcbiAgICAgICAgbWV0YWRhdGEgPSB0aGlzLmdldE1ldGFkYXRhKHZhbHVlKTtcclxuICAgIH1cclxuICAgIGVsc2Uge1xyXG4gICAgICAgIG1ldGFkYXRhID0gZGQubWVyZ2UodGhpcy5zZXR0aW5ncy5kZWZhdWx0TWV0YWRhdGEsIG1ldGFkYXRhKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKCFtZXRhZGF0YS5kb21haW4pIHtcclxuICAgICAgICB2YXIgc3RhdHMgPSBnZXRTdGF0cyh0aGlzLmdldFJlcHJlc2VudGF0aW9ucyhzZWxlY3Rpb24pLCBwcm9wZXJ0aWVzX2FjY2Vzc29yKGtleU9yQ2FsbGJhY2sodmFsdWUpKSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKHN0YXRzLmFueU5lZ2F0aXZlICYmIHN0YXRzLmFueVBvc2l0aXZlKSB7XHJcbiAgICAgICAgICAgIC8vIG1ha2Ugc3ltbWV0cmljYWxcclxuICAgICAgICAgICAgbWV0YWRhdGEuZG9tYWluID0gW01hdGgubWluKHN0YXRzLm1pbiwgLXN0YXRzLm1heCksIE1hdGgubWF4KHN0YXRzLm1heCwgLXN0YXRzLm1pbildO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgbWV0YWRhdGEuZG9tYWluID0gW3N0YXRzLm1pbixzdGF0cy5tYXhdO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIC8vIHN1cHBvcnQgZDMgc2NhbGVzIG91dCBvZiB0aGUgYm94XHJcbiAgICB2YXIgc2NhbGUgPSBkMy5zY2FsZVttZXRhZGF0YS5zY2FsZV0oKTtcclxuICAgIHNjYWxlLmRvbWFpbihtZXRhZGF0YS5kb21haW4pLnJhbmdlKG1ldGFkYXRhLmNvbG9yIHx8IG1ldGFkYXRhLmNvbG9ycylcclxuICAgIFxyXG4gICAgaWYgKG1ldGFkYXRhLnNjYWxlID09ICdvcmRpbmFsJyAmJiAhc2NhbGUuaW52ZXJ0KSB7XHJcbiAgICAgICAgLy8gZDMgb3JkaW5hbCBzY2FsZXMgZG9uJ3QgcHJvdmlkZSBpbnZlcnQgbWV0aG9kLCBzbyBwYXRjaCBvbmUgaGVyZVxyXG4gICAgICAgIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9tYm9zdG9jay9kMy9wdWxsLzU5OFxyXG4gICAgICAgIHNjYWxlLmludmVydCA9IGZ1bmN0aW9uKHgpIHtcclxuICAgICAgICAgICAgdmFyIGkgPSBzY2FsZS5yYW5nZSgpLmluZGV4T2YoeCk7XHJcbiAgICAgICAgICAgIHJldHVybiAoaSA+IC0xKSA/IG1ldGFkYXRhLmRvbWFpbltpXSA6IG51bGw7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICByZXR1cm4gc2NhbGU7ICAgIFxyXG59O1xyXG5cclxubWFwbWFwLnByb3RvdHlwZS5hdXRvTGluZWFyU2NhbGUgPSBmdW5jdGlvbih2YWx1ZUZ1bmMpIHsgICAgXHJcbiAgICB2YXIgc3RhdHMgPSBnZXRTdGF0cyh0aGlzLl9lbGVtZW50cy5nZW9tZXRyeS5zZWxlY3RBbGwoJ3BhdGgnKSwgcHJvcGVydGllc19hY2Nlc3Nvcih2YWx1ZUZ1bmMpKTsgICAgXHJcbiAgICByZXR1cm4gZDMuc2NhbGUubGluZWFyKClcclxuICAgICAgICAuZG9tYWluKFswLHN0YXRzLm1heF0pOyAgICBcclxufTtcclxubWFwbWFwLnByb3RvdHlwZS5hdXRvU3FydFNjYWxlID0gZnVuY3Rpb24odmFsdWVGdW5jKSB7ICAgIFxyXG4gICAgdmFyIHN0YXRzID0gZ2V0U3RhdHModGhpcy5fZWxlbWVudHMuZ2VvbWV0cnkuc2VsZWN0QWxsKCdwYXRoJyksIHByb3BlcnRpZXNfYWNjZXNzb3IodmFsdWVGdW5jKSk7ICAgIFxyXG4gICAgcmV0dXJuIGQzLnNjYWxlLnNxcnQoKVxyXG4gICAgICAgIC5kb21haW4oWzAsc3RhdHMubWF4XSk7ICAgIFxyXG59O1xyXG5cclxubWFwbWFwLnByb3RvdHlwZS5hdHRyID0gZnVuY3Rpb24obmFtZSwgdmFsdWUsIHNlbGVjdGlvbikge1xyXG4gICAgaWYgKGRkLmlzRGljdGlvbmFyeShuYW1lKSAmJiB2YWx1ZSkge1xyXG4gICAgICAgIHNlbGVjdGlvbiA9IHZhbHVlO1xyXG4gICAgICAgIHZhbHVlID0gdW5kZWZpbmVkO1xyXG4gICAgfVxyXG4gICAgdGhpcy5zeW1ib2xpemUoZnVuY3Rpb24ocmVwcikge1xyXG4gICAgICAgIHJlcHIuYXR0cihuYW1lLCB2YWx1ZSk7XHJcbiAgICB9LCBzZWxlY3Rpb24pO1xyXG4gICAgcmV0dXJuIHRoaXM7XHJcbn07XHJcblxyXG5tYXBtYXAucHJvdG90eXBlLnpPcmRlciA9IGZ1bmN0aW9uKGNvbXBhcmF0b3IsIG9wdGlvbnMpIHtcclxuICAgIFxyXG4gICAgb3B0aW9ucyA9IGRkLm1lcmdlKHtcclxuICAgICAgICB1bmRlZmluZWRWYWx1ZTogSW5maW5pdHlcclxuICAgIH0sIG9wdGlvbnMpO1xyXG5cclxuICAgIGlmIChkZC5pc1N0cmluZyhjb21wYXJhdG9yKSkge1xyXG4gICAgICAgIHZhciBmaWVsZE5hbWUgPSBjb21wYXJhdG9yO1xyXG4gICAgICAgIHZhciByZXZlcnNlID0gZmFsc2U7XHJcbiAgICAgICAgaWYgKGZpZWxkTmFtZVswXSA9PSBcIi1cIikge1xyXG4gICAgICAgICAgICByZXZlcnNlID0gdHJ1ZTtcclxuICAgICAgICAgICAgZmllbGROYW1lID0gZmllbGROYW1lLnN1YnN0cmluZygxKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgY29tcGFyYXRvciA9IGZ1bmN0aW9uKGEsYikge1xyXG4gICAgICAgICAgICB2YXIgdmFsQSA9IGEucHJvcGVydGllc1tmaWVsZE5hbWVdLFxyXG4gICAgICAgICAgICAgICAgdmFsQiA9IGIucHJvcGVydGllc1tmaWVsZE5hbWVdO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmICh2YWxBID09PSB1bmRlZmluZWQgfHwgaXNOYU4odmFsQSkpIHtcclxuICAgICAgICAgICAgICAgIHZhbEEgPSBvcHRpb25zLnVuZGVmaW5lZFZhbHVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmICh2YWxCID09PSB1bmRlZmluZWQgfHwgaXNOYU4odmFsQikpIHtcclxuICAgICAgICAgICAgICAgIHZhbEIgPSBvcHRpb25zLnVuZGVmaW5lZFZhbHVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHZhciByZXN1bHQgPSB2YWxBIC0gdmFsQjtcclxuICAgICAgICAgICAgaWYgKHJldmVyc2UpIHJlc3VsdCAqPSAtMTtcclxuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHZhciBtYXAgPSB0aGlzO1xyXG4gICAgdGhpcy5wcm9taXNlX2RhdGEoKS50aGVuKGZ1bmN0aW9uKGRhdGEpIHsgICAgICBcclxuICAgICAgICBtYXAuZ2V0UmVwcmVzZW50YXRpb25zKClcclxuICAgICAgICAgICAgLnNvcnQoY29tcGFyYXRvcik7XHJcbiAgICB9KTtcclxuICAgIHJldHVybiB0aGlzO1xyXG59O1xyXG5cclxuLy8gVE9ETzogcmlnaHQgbm93LCBzeW1ib2xpemUgZG9lc24ndCBzZWVtIHRvIGJlIGFueSBkaWZmZXJlbnQgZnJvbSBhcHBseUJlaGF2aW9yIVxyXG4vLyBlaXRoZXIgdGhpcyBzaG91bGQgYmUgdW5pZmllZCwgb3IgdGhlIGRpc3RpbmN0aW9ucyBjbGVhcmx5IHdvcmtlZCBvdXRcclxubWFwbWFwLnByb3RvdHlwZS5zeW1ib2xpemUgPSBmdW5jdGlvbihjYWxsYmFjaywgc2VsZWN0aW9uLCBmaW5hbGl6ZSkge1xyXG5cclxuICAgIHZhciBtYXAgPSB0aGlzO1xyXG4gICAgXHJcbiAgICAvLyBzdG9yZSBpbiBjbG9zdXJlIGZvciBsYXRlciBhY2Nlc3NcclxuICAgIHNlbGVjdGlvbiA9IHNlbGVjdGlvbiB8fCB0aGlzLnNlbGVjdGVkO1xyXG4gICAgdGhpcy5wcm9taXNlX2RhdGEoKS50aGVuKGZ1bmN0aW9uKGRhdGEpIHsgICAgICBcclxuICAgICAgICBtYXAuZ2V0UmVwcmVzZW50YXRpb25zKHNlbGVjdGlvbilcclxuICAgICAgICAgICAgLmVhY2goZnVuY3Rpb24oZ2VvbSkge1xyXG4gICAgICAgICAgICAgICAgY2FsbGJhY2suY2FsbChtYXAsIGQzLnNlbGVjdCh0aGlzKSwgZ2VvbSwgZ2VvbS5wcm9wZXJ0aWVzKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgaWYgKGZpbmFsaXplKSBmaW5hbGl6ZS5jYWxsKG1hcCk7XHJcbiAgICB9KTtcclxuICAgIHJldHVybiB0aGlzO1xyXG59O1xyXG5cclxubWFwbWFwLnByb3RvdHlwZS5zeW1ib2xpemVBdHRyaWJ1dGUgPSBmdW5jdGlvbihzcGVjLCByZXByQXR0cmlidXRlLCBtZXRhQXR0cmlidXRlLCBzZWxlY3Rpb24pIHtcclxuXHJcbiAgICB2YXIgZGVmYXVsdFVuZGVmaW5lZEF0dHJpYnV0ZXMgPSB7XHJcbiAgICAgICAgJ3N0cm9rZSc6ICd0cmFuc3BhcmVudCcgIFxyXG4gICAgfTtcclxuICAgIFxyXG4gICAgdmFyIHZhbHVlRnVuYyA9IGtleU9yQ2FsbGJhY2soc3BlYyk7XHJcblxyXG4gICAgbWV0YUF0dHJpYnV0ZSA9IG1ldGFBdHRyaWJ1dGUgfHwgcmVwckF0dHJpYnV0ZTsgICAgXHJcbiAgICBzZWxlY3Rpb24gPSBzZWxlY3Rpb24gfHwgdGhpcy5zZWxlY3RlZDtcclxuXHJcbiAgICBcclxuICAgIHZhciBtYXAgPSB0aGlzO1xyXG4gICAgXHJcbiAgICB0aGlzLnByb21pc2VfZGF0YSgpLnRoZW4oZnVuY3Rpb24oZGF0YSkgeyAgICAgIFxyXG5cclxuICAgICAgICB2YXIgbWV0YWRhdGEgPSBtYXAuZ2V0TWV0YWRhdGEoc3BlYyk7XHJcblxyXG4gICAgICAgIHZhciBzY2FsZSA9IGQzLnNjYWxlW21ldGFkYXRhLnNjYWxlXSgpO1xyXG4gICAgICAgIHNjYWxlLmRvbWFpbihtZXRhZGF0YS5kb21haW4pLnJhbmdlKG1ldGFkYXRhW21ldGFBdHRyaWJ1dGVdKTtcclxuXHJcbiAgICAgICAgbWFwLnN5bWJvbGl6ZShmdW5jdGlvbihlbCwgZ2VvbSwgZGF0YSkge1xyXG4gICAgICAgICAgICBlbC5hdHRyKHJlcHJBdHRyaWJ1dGUsIGZ1bmN0aW9uKGdlb20pIHtcclxuICAgICAgICAgICAgICAgIHZhciB2YWwgPSB2YWx1ZUZ1bmMoZ2VvbS5wcm9wZXJ0aWVzKTtcclxuICAgICAgICAgICAgICAgIGlmICh2YWwgPT0gbnVsbCB8fCAobWV0YWRhdGEuc2NhbGUgIT0gJ29yZGluYWwnICYmIGlzTmFOKHZhbCkpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIChtZXRhZGF0YS51bmRlZmluZWRWYWx1ZXMgJiYgbWV0YWRhdGEudW5kZWZpbmVkVmFsdWVzW3JlcHJBdHRyaWJ1dGVdKSB8fCBkZWZhdWx0VW5kZWZpbmVkQXR0cmlidXRlc1tyZXByQXR0cmlidXRlXTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHJldHVybiBzY2FsZSh2YWwpO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9LCBzZWxlY3Rpb24pO1xyXG5cclxuICAgICAgICBtYXAudXBkYXRlTGVnZW5kKHNwZWMsIHJlcHJBdHRyaWJ1dGUsIG1ldGFkYXRhLCBzY2FsZSwgc2VsZWN0aW9uKTtcclxuICAgIH0pO1xyXG4gICAgXHJcbiAgICByZXR1cm4gdGhpcztcclxuICAgIFxyXG59XHJcblxyXG5cclxuLy8gVE9ETzogaW1wcm92ZSBoYW5kbGluZyBvZiB1c2luZyBhIGZ1bmN0aW9uIGhlcmUgdnMuIHVzaW5nIGEgbmFtZWQgcHJvcGVydHlcclxuLy8gcHJvYmFibHkgbmVlZHMgYSB1bmlmaWVkIG1lY2hhbmlzbSB0byBkZWFsIHdpdGggcHJvcGVydHkvZnVuYyB0byBiZSB1c2VkIGVsc2V3aGVyZVxyXG5tYXBtYXAucHJvdG90eXBlLmNob3JvcGxldGggPSBmdW5jdGlvbihzcGVjLCBtZXRhZGF0YSwgc2VsZWN0aW9uKSB7ICAgIFxyXG4gICAgLy8gd2UgaGF2ZSB0byByZW1lbWJlciB0aGUgc2NhbGUgZm9yIGxlZ2VuZCgpXHJcbiAgICB2YXIgY29sb3JTY2FsZSA9IG51bGwsXHJcbiAgICAgICAgdmFsdWVGdW5jID0ga2V5T3JDYWxsYmFjayhzcGVjKSxcclxuICAgICAgICBtYXAgPSB0aGlzO1xyXG4gICAgICAgIFxyXG4gICAgZnVuY3Rpb24gY29sb3IoZWwsIGdlb20sIGRhdGEpIHtcclxuICAgICAgICBpZiAoc3BlYyA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICAvLyBjbGVhclxyXG4gICAgICAgICAgICBlbC5hdHRyKCdmaWxsJywgdGhpcy5zZXR0aW5ncy5wYXRoQXR0cmlidXRlcy5maWxsKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICAvLyBvbiBmaXJzdCBjYWxsLCBzZXQgdXAgc2NhbGUgJiBsZWdlbmRcclxuICAgICAgICBpZiAoIWNvbG9yU2NhbGUpIHtcclxuICAgICAgICAgICAgLy8gVE9ETzogaW1wcm92ZSBoYW5kbGluZyBvZiB0aGluZ3MgdGhhdCBuZWVkIHRoZSBkYXRhLCBidXQgc2hvdWxkIGJlIHBlcmZvcm1lZFxyXG4gICAgICAgICAgICAvLyBvbmx5IG9uY2UuIFNob3VsZCB3ZSBwcm92aWRlIGEgc2VwYXJhdGUgY2FsbGJhY2sgZm9yIHRoaXMsIG9yIHVzZSB0aGUgXHJcbiAgICAgICAgICAgIC8vIHByb21pc2VfZGF0YSgpLnRoZW4oKSBmb3Igc2V0dXA/IEFzIHRoaXMgY291bGQgYmUgY29uc2lkZXJlZCBhIHB1YmxpYyBBUEkgdXNlY2FzZSxcclxuICAgICAgICAgICAgLy8gbWF5YmUgdXNpbmcgcHJvbWlzZXMgaXMgYSBiaXQgc3RlZXAgZm9yIG91dHNpZGUgdXNlcnM/XHJcbiAgICAgICAgICAgIGlmICh0eXBlb2YgbWV0YWRhdGEgPT0gJ3N0cmluZycpIHtcclxuICAgICAgICAgICAgICAgIG1ldGFkYXRhID0gdGhpcy5nZXRNZXRhZGF0YShtZXRhZGF0YSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgaWYgKCFtZXRhZGF0YSkge1xyXG4gICAgICAgICAgICAgICAgbWV0YWRhdGEgPSB0aGlzLmdldE1ldGFkYXRhKHNwZWMpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGNvbG9yU2NhbGUgPSB0aGlzLmF1dG9Db2xvclNjYWxlKHNwZWMsIG1ldGFkYXRhLCBzZWxlY3Rpb24pO1xyXG4gICAgICAgICAgICB0aGlzLnVwZGF0ZUxlZ2VuZChzcGVjLCAnZmlsbCcsIG1ldGFkYXRhLCBjb2xvclNjYWxlLCBzZWxlY3Rpb24pO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoZWwuYXR0cignZmlsbCcpICE9ICdub25lJykge1xyXG4gICAgICAgICAgICAvLyB0cmFuc2l0aW9uIGlmIGNvbG9yIGFscmVhZHkgc2V0XHJcbiAgICAgICAgICAgIGVsID0gZWwudHJhbnNpdGlvbigpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbC5hdHRyKCdmaWxsJywgZnVuY3Rpb24oZ2VvbSkgeyAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHZhciB2YWwgPSB2YWx1ZUZ1bmMoZ2VvbS5wcm9wZXJ0aWVzKTtcclxuICAgICAgICAgICAgLy8gY2hlY2sgaWYgdmFsdWUgaXMgdW5kZWZpbmVkIG9yIG51bGxcclxuICAgICAgICAgICAgaWYgKHZhbCA9PSBudWxsIHx8IChtZXRhZGF0YS5zY2FsZSAhPSAnb3JkaW5hbCcgJiYgaXNOYU4odmFsKSkpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBtZXRhZGF0YS51bmRlZmluZWRDb2xvciB8fCBtYXAuc2V0dGluZ3MucGF0aEF0dHJpYnV0ZXMuZmlsbDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICByZXR1cm4gY29sb3JTY2FsZSh2YWwpIHx8IG1hcC5zZXR0aW5ncy5wYXRoQXR0cmlidXRlcy5maWxsO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICB0aGlzLnN5bWJvbGl6ZShjb2xvciwgc2VsZWN0aW9uLCBmdW5jdGlvbigpe1xyXG4gICAgICAgIHRoaXMuZGlzcGF0Y2hlci5jaG9yb3BsZXRoLmNhbGwodGhpcywgc3BlYyk7XHJcbiAgICB9KTtcclxuICAgICAgICBcclxuICAgIHJldHVybiB0aGlzO1xyXG59O1xyXG5cclxuLy8gVE9ETzogdGhpcyBzaG91bGQgYmUgZWFzaWx5IGltcGxlbWVudGVkIHVzaW5nIHN5bWJvbGl6ZUF0dHJpYnV0ZSBhbmQgcmVtb3ZlZFxyXG5tYXBtYXAucHJvdG90eXBlLnN0cm9rZUNvbG9yID0gZnVuY3Rpb24oc3BlYywgbWV0YWRhdGEsIHNlbGVjdGlvbikgeyAgICBcclxuICAgIC8vIHdlIGhhdmUgdG8gcmVtZW1iZXIgdGhlIHNjYWxlIGZvciBsZWdlbmQoKVxyXG4gICAgdmFyIGNvbG9yU2NhbGUgPSBudWxsLFxyXG4gICAgICAgIHZhbHVlRnVuYyA9IGtleU9yQ2FsbGJhY2soc3BlYyksXHJcbiAgICAgICAgbWFwID0gdGhpcztcclxuICAgICAgICBcclxuICAgIGZ1bmN0aW9uIGNvbG9yKGVsLCBnZW9tLCBkYXRhKSB7XHJcbiAgICAgICAgaWYgKHNwZWMgPT09IG51bGwpIHtcclxuICAgICAgICAgICAgLy8gY2xlYXJcclxuICAgICAgICAgICAgZWwuYXR0cignc3Ryb2tlJywgdGhpcy5zZXR0aW5ncy5wYXRoQXR0cmlidXRlcy5zdHJva2UpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIG9uIGZpcnN0IGNhbGwsIHNldCB1cCBzY2FsZSAmIGxlZ2VuZFxyXG4gICAgICAgIGlmICghY29sb3JTY2FsZSkge1xyXG4gICAgICAgICAgICAvLyBUT0RPOiBpbXByb3ZlIGhhbmRsaW5nIG9mIHRoaW5ncyB0aGF0IG5lZWQgdGhlIGRhdGEsIGJ1dCBzaG91bGQgYmUgcGVyZm9ybWVkXHJcbiAgICAgICAgICAgIC8vIG9ubHkgb25jZS4gU2hvdWxkIHdlIHByb3ZpZGUgYSBzZXBhcmF0ZSBjYWxsYmFjayBmb3IgdGhpcywgb3IgdXNlIHRoZSBcclxuICAgICAgICAgICAgLy8gcHJvbWlzZV9kYXRhKCkudGhlbigpIGZvciBzZXR1cD8gQXMgdGhpcyBjb3VsZCBiZSBjb25zaWRlcmVkIGEgcHVibGljIEFQSSB1c2VjYXNlLFxyXG4gICAgICAgICAgICAvLyBtYXliZSB1c2luZyBwcm9taXNlcyBpcyBhIGJpdCBzdGVlcCBmb3Igb3V0c2lkZSB1c2Vycz9cclxuICAgICAgICAgICAgaWYgKHR5cGVvZiBtZXRhZGF0YSA9PSAnc3RyaW5nJykge1xyXG4gICAgICAgICAgICAgICAgbWV0YWRhdGEgPSB0aGlzLmdldE1ldGFkYXRhKG1ldGFkYXRhKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBpZiAoIW1ldGFkYXRhKSB7XHJcbiAgICAgICAgICAgICAgICBtZXRhZGF0YSA9IHRoaXMuZ2V0TWV0YWRhdGEoc3BlYyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgY29sb3JTY2FsZSA9IHRoaXMuYXV0b0NvbG9yU2NhbGUoc3BlYywgbWV0YWRhdGEsIHNlbGVjdGlvbik7XHJcbiAgICAgICAgICAgIHRoaXMudXBkYXRlTGVnZW5kKHNwZWMsICdzdHJva2VDb2xvcicsIG1ldGFkYXRhLCBjb2xvclNjYWxlLCBzZWxlY3Rpb24pO1xyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoZWwuYXR0cignc3Ryb2tlJykgIT0gJ25vbmUnKSB7XHJcbiAgICAgICAgICAgIC8vIHRyYW5zaXRpb24gaWYgY29sb3IgYWxyZWFkeSBzZXRcclxuICAgICAgICAgICAgZWwgPSBlbC50cmFuc2l0aW9uKCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsLmF0dHIoJ3N0cm9rZScsIGZ1bmN0aW9uKGdlb20pIHsgICAgICAgICAgIFxyXG4gICAgICAgICAgICB2YXIgdmFsID0gdmFsdWVGdW5jKGdlb20ucHJvcGVydGllcyk7XHJcbiAgICAgICAgICAgIC8vIGNoZWNrIGlmIHZhbHVlIGlzIHVuZGVmaW5lZCBvciBudWxsXHJcbiAgICAgICAgICAgIGlmICh2YWwgPT0gbnVsbCB8fCAobWV0YWRhdGEuc2NhbGUgIT0gJ29yZGluYWwnICYmIGlzTmFOKHZhbCkpKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gbWV0YWRhdGEudW5kZWZpbmVkQ29sb3IgfHwgbWFwLnNldHRpbmdzLnBhdGhBdHRyaWJ1dGVzLnN0cm9rZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICByZXR1cm4gY29sb3JTY2FsZSh2YWwpIHx8IG1hcC5zZXR0aW5ncy5wYXRoQXR0cmlidXRlcy5zdHJva2U7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHRoaXMuc3ltYm9saXplKGNvbG9yLCBzZWxlY3Rpb24pO1xyXG4gICAgICAgIFxyXG4gICAgcmV0dXJuIHRoaXM7XHJcbn07XHJcblxyXG4vLyBUT0RPOiBzaG91bGQgd2UgZXZlbiBoYXZlIHRoaXMsIG9yIHB1dCB2aXouIHRlY2huaXF1ZXMgaW4gYSBzZXBhcmF0ZSBwcm9qZWN0L25hbWVzcGFjZT9cclxubWFwbWFwLnByb3RvdHlwZS5wcm9wb3J0aW9uYWxfY2lyY2xlcyA9IGZ1bmN0aW9uKHZhbHVlLCBzY2FsZSkge1xyXG4gICAgXHJcbiAgICB2YXIgdmFsdWVGdW5jID0ga2V5T3JDYWxsYmFjayh2YWx1ZSk7XHJcblxyXG4gICAgdmFyIHBhdGhHZW5lcmF0b3IgPSBkMy5nZW8ucGF0aCgpLnByb2plY3Rpb24odGhpcy5fcHJvamVjdGlvbik7ICAgIFxyXG4gICAgXHJcbiAgICBzY2FsZSA9IHNjYWxlIHx8IDIwO1xyXG4gICAgXHJcbiAgICB0aGlzLnN5bWJvbGl6ZShmdW5jdGlvbihlbCwgZ2VvbSwgZGF0YSkge1xyXG4gICAgICAgIGlmICh2YWx1ZSA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICB0aGlzLl9lbGVtZW50cy5vdmVybGF5LnNlbGVjdCgnY2lyY2xlJykucmVtb3ZlKCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2UgaWYgKGdlb20ucHJvcGVydGllcyAmJiB0eXBlb2YgdmFsdWVGdW5jKGdlb20ucHJvcGVydGllcykgIT0gJ3VuZGVmaW5lZCcpIHtcclxuICAgICAgICAgICAgLy8gaWYgc2NhbGUgaXMgbm90IHNldCwgY2FsY3VsYXRlIHNjYWxlIG9uIGZpcnN0IGNhbGxcclxuICAgICAgICAgICAgaWYgKHR5cGVvZiBzY2FsZSAhPSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgICAgICAgICBzY2FsZSA9IHRoaXMuYXV0b1NxcnRTY2FsZSh2YWx1ZUZ1bmMpLnJhbmdlKFswLHNjYWxlXSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdmFyIGNlbnRyb2lkID0gcGF0aEdlbmVyYXRvci5jZW50cm9pZChnZW9tKTtcclxuICAgICAgICAgICAgdGhpcy5fZWxlbWVudHMub3ZlcmxheS5hcHBlbmQoJ2NpcmNsZScpXHJcbiAgICAgICAgICAgICAgICAuYXR0cih0aGlzLnNldHRpbmdzLm92ZXJsYXlBdHRyaWJ1dGVzKVxyXG4gICAgICAgICAgICAgICAgLmF0dHIoe1xyXG4gICAgICAgICAgICAgICAgICAgIHI6IHNjYWxlKHZhbHVlRnVuYyhnZW9tLnByb3BlcnRpZXMpKSxcclxuICAgICAgICAgICAgICAgICAgICBjeDogY2VudHJvaWRbMF0sXHJcbiAgICAgICAgICAgICAgICAgICAgY3k6IGNlbnRyb2lkWzFdXHJcbiAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICB9XHJcbiAgICB9KTtcclxuICAgIHJldHVybiB0aGlzO1xyXG59O1xyXG5cclxubWFwbWFwLnN5bWJvbGl6ZSA9IHt9O1xyXG5cclxubWFwbWFwLnN5bWJvbGl6ZS5hZGRMYWJlbCA9IGZ1bmN0aW9uKHNwZWMpIHtcclxuXHJcbiAgICB2YXIgdmFsdWVGdW5jID0ga2V5T3JDYWxsYmFjayhzcGVjKTtcclxuICAgICAgICBcclxuICAgIHZhciBwYXRoR2VuZXJhdG9yID0gZDMuZ2VvLnBhdGgoKTsgICAgXHJcblxyXG4gICAgcmV0dXJuIGZ1bmN0aW9uKGVsLCBnZW9tLCBkYXRhKSB7XHJcbiAgICAgICAgLy8gbGF6eSBpbml0aWFsaXphdGlvbiBvZiBwcm9qZWN0aW9uXHJcbiAgICAgICAgLy8gd2UgZG9udCd0IGhhdmUgYWNjZXNzIHRvIHRoZSBtYXAgYWJvdmUsIGFuZCBhbHNvIHByb2plY3Rpb25cclxuICAgICAgICAvLyBtYXkgbm90IGhhdmUgYmVlbiBpbml0aWFsaXplZCBjb3JyZWN0bHlcclxuICAgICAgICBpZiAocGF0aEdlbmVyYXRvci5wcm9qZWN0aW9uKCkgIT09IHRoaXMuX3Byb2plY3Rpb24pIHtcclxuICAgICAgICAgICAgcGF0aEdlbmVyYXRvci5wcm9qZWN0aW9uKHRoaXMuX3Byb2plY3Rpb24pO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gVE9ETzogaG93IHRvIHByb3Blcmx5IHJlbW92ZSBzeW1ib2xpemF0aW9ucz9cclxuICAgICAgICBpZiAoc3BlYyA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICB0aGlzLl9lbGVtZW50cy5vdmVybGF5LnNlbGVjdCgnY2lyY2xlJykucmVtb3ZlKCk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKGdlb20ucHJvcGVydGllcyAmJiB0eXBlb2YgdmFsdWVGdW5jKGdlb20ucHJvcGVydGllcykgIT0gJ3VuZGVmaW5lZCcpIHtcclxuICAgICAgICAgICAgdmFyIGNlbnRyb2lkID0gcGF0aEdlbmVyYXRvci5jZW50cm9pZChnZW9tKTtcclxuICAgICAgICAgICAgdGhpcy5fZWxlbWVudHMub3ZlcmxheS5hcHBlbmQoJ3RleHQnKVxyXG4gICAgICAgICAgICAgICAgLnRleHQodmFsdWVGdW5jKGdlb20ucHJvcGVydGllcykpXHJcbiAgICAgICAgICAgICAgICAuYXR0cih7XHJcbiAgICAgICAgICAgICAgICAgICAgc3Ryb2tlOiAnI2ZmZmZmZicsXHJcbiAgICAgICAgICAgICAgICAgICAgZmlsbDogJyMwMDAwMDAnLFxyXG4gICAgICAgICAgICAgICAgICAgICdmb250LXNpemUnOiA5LFxyXG4gICAgICAgICAgICAgICAgICAgICdwYWludC1vcmRlcic6ICdzdHJva2UgZmlsbCcsXHJcbiAgICAgICAgICAgICAgICAgICAgJ2FsaWdubWVudC1iYXNlbGluZSc6ICdtaWRkbGUnLFxyXG4gICAgICAgICAgICAgICAgICAgIGR4OiA3LFxyXG4gICAgICAgICAgICAgICAgICAgIGR5OiAxXHJcbiAgICAgICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICAgICAgLmF0dHIoeyAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgeDogY2VudHJvaWRbMF0sXHJcbiAgICAgICAgICAgICAgICAgICAgeTogY2VudHJvaWRbMV1cclxuICAgICAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgIDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGFkZE9wdGlvbmFsRWxlbWVudChlbGVtZW50TmFtZSkge1xyXG4gICAgcmV0dXJuIGZ1bmN0aW9uKHZhbHVlKSB7XHJcbiAgICAgICAgdmFyIHZhbHVlRnVuYyA9IGtleU9yQ2FsbGJhY2sodmFsdWUpO1xyXG4gICAgICAgIHRoaXMuc3ltYm9saXplKGZ1bmN0aW9uKGVsLCBkKSB7ICBcclxuICAgICAgICAgICAgaWYgKHZhbHVlID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICBlbC5zZWxlY3QoZWxlbWVudE5hbWUpLnJlbW92ZSgpO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsLmFwcGVuZChlbGVtZW50TmFtZSlcclxuICAgICAgICAgICAgICAgIC50ZXh0KHZhbHVlRnVuYyhkLnByb3BlcnRpZXMpKTtcclxuICAgICAgICB9KTtcclxuICAgICAgICByZXR1cm4gdGhpcztcclxuICAgIH07XHJcbn1cclxuXHJcbm1hcG1hcC5wcm90b3R5cGUudGl0bGUgPSBhZGRPcHRpb25hbEVsZW1lbnQoJ3RpdGxlJyk7XHJcbm1hcG1hcC5wcm90b3R5cGUuZGVzYyA9IGFkZE9wdGlvbmFsRWxlbWVudCgnZGVzYycpO1xyXG5cclxudmFyIGNlbnRlciA9IHtcclxuICAgIHg6IDAuNSxcclxuICAgIHk6IDAuNVxyXG59O1xyXG5cclxubWFwbWFwLnByb3RvdHlwZS5jZW50ZXIgPSBmdW5jdGlvbihjZW50ZXJfeCwgY2VudGVyX3kpIHtcclxuICAgIGNlbnRlci54ID0gY2VudGVyX3g7XHJcbiAgICBpZiAodHlwZW9mIGNlbnRlcl95ICE9ICd1bmRlZmluZWQnKSB7XHJcbiAgICAgICAgY2VudGVyLnkgPSBjZW50ZXJfeTtcclxuICAgIH1cclxuICAgIHJldHVybiB0aGlzO1xyXG59O1xyXG4vLyBzdG9yZSBhbGwgaG92ZXIgb3V0IGNhbGxiYWNrcyBoZXJlLCB0aGlzIHdpbGwgYmUgY2FsbGVkIG9uIHpvb21cclxudmFyIGhvdmVyT3V0Q2FsbGJhY2tzID0gW107XHJcblxyXG5mdW5jdGlvbiBjYWxsSG92ZXJPdXQoKSB7XHJcbiAgICBmb3IgKHZhciBpPTA7IGk8aG92ZXJPdXRDYWxsYmFja3MubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICBob3Zlck91dENhbGxiYWNrc1tpXSgpO1xyXG4gICAgfVxyXG59XHJcblxyXG52YXIgbW91c2VvdmVyID0gbnVsbDtcclxuXHJcbm1hcG1hcC5zaG93SG92ZXIgPSBmdW5jdGlvbihlbCkge1xyXG4gICAgaWYgKG1vdXNlb3Zlcikge1xyXG4gICAgICAgIG1vdXNlb3Zlci5jYWxsKGVsLCBlbC5fX2RhdGFfXyk7XHJcbiAgICB9XHJcbn07XHJcblxyXG5tYXBtYXAucHJvdG90eXBlLmdldEFuY2hvckZvclJlcHIgPSBmdW5jdGlvbihldmVudCwgcmVwciwgb3B0aW9ucykge1xyXG5cclxuICAgIG9wdGlvbnMgPSBkZC5tZXJnZSh7XHJcbiAgICAgICAgY2xpcFRvVmlld3BvcnQ6IHRydWUsXHJcbiAgICAgICAgY2xpcE1hcmdpbnM6IHt0b3A6IDQwLCBsZWZ0OiA0MCwgYm90dG9tOiAwLCByaWdodDogNDB9XHJcbiAgICB9LCBvcHRpb25zKTtcclxuICAgIFxyXG4gICAgdmFyIGJvdW5kcyA9IHJlcHIuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XHJcbiAgICB2YXIgcHQgPSB0aGlzLl9lbGVtZW50cy5tYWluLm5vZGUoKS5jcmVhdGVTVkdQb2ludCgpO1xyXG4gICAgXHJcbiAgICBwdC54ID0gKGJvdW5kcy5sZWZ0ICsgYm91bmRzLnJpZ2h0KSAvIDI7XHJcbiAgICBwdC55ID0gYm91bmRzLnRvcDtcclxuICAgIFxyXG4gICAgdmFyIG1hcEJvdW5kcyA9IHRoaXMuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XHJcbiAgICBcclxuICAgIGlmIChvcHRpb25zLmNsaXBUb1ZpZXdwb3J0KSB7ICBcclxuICAgICAgICBpZiAocHQueCA8IG1hcEJvdW5kcy5sZWZ0ICsgb3B0aW9ucy5jbGlwTWFyZ2lucy5sZWZ0KSBwdC54ID0gbWFwQm91bmRzLmxlZnQgKyBvcHRpb25zLmNsaXBNYXJnaW5zLmxlZnQ7XHJcbiAgICAgICAgaWYgKHB0LnggPiBtYXBCb3VuZHMucmlnaHQgLSBvcHRpb25zLmNsaXBNYXJnaW5zLnJpZ2h0KSBwdC54ID0gbWFwQm91bmRzLnJpZ2h0IC0gb3B0aW9ucy5jbGlwTWFyZ2lucy5yaWdodDtcclxuICAgICAgICBpZiAocHQueSA8IG1hcEJvdW5kcy50b3AgKyBvcHRpb25zLmNsaXBNYXJnaW5zLnRvcCkgcHQueSA9IG1hcEJvdW5kcy50b3AgKyBvcHRpb25zLmNsaXBNYXJnaW5zLnRvcDtcclxuICAgICAgICBpZiAocHQueSA+IG1hcEJvdW5kcy5ib3R0b20gLSBvcHRpb25zLmNsaXBNYXJnaW5zLmJvdHRvbSkgcHQueSA9IG1hcEJvdW5kcy5ib3R0b20gLSBvcHRpb25zLmNsaXBNYXJnaW5zLmJvdHRvbTtcclxuICAgIH1cclxuICAgIHB0LnggLT0gbWFwQm91bmRzLmxlZnQ7XHJcbiAgICBwdC55IC09IG1hcEJvdW5kcy50b3A7XHJcblxyXG4gICAgcmV0dXJuIHB0O1xyXG59XHJcblxyXG5tYXBtYXAucHJvdG90eXBlLmdldEFuY2hvckZvck1vdXNlUG9zaXRpb24gPSBmdW5jdGlvbihldmVudCwgcmVwciwgb3B0aW9ucykge1xyXG4gICAgIFxyXG4gICAgb3B0aW9ucyA9IGRkLm1lcmdlKHtcclxuICAgICAgICBhbmNob3JPZmZzZXQ6IFswLC0yMF1cclxuICAgICB9LCBvcHRpb25zKTtcclxuXHJcbiAgICAgLy8gaHR0cDovL3d3dy5qYWNrbG1vb3JlLmNvbS9ub3Rlcy9tb3VzZS1wb3NpdGlvbi9cclxuICAgICB2YXIgb2Zmc2V0WCA9IGV2ZW50LmxheWVyWCB8fCBldmVudC5vZmZzZXRYLFxyXG4gICAgICAgICBvZmZzZXRZID0gZXZlbnQubGF5ZXJZIHx8IGV2ZW50Lm9mZnNldFk7XHJcbiAgICBcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgeDogb2Zmc2V0WCArIG9wdGlvbnMuYW5jaG9yT2Zmc2V0WzBdLFxyXG4gICAgICAgIHk6IG9mZnNldFkgKyBvcHRpb25zLmFuY2hvck9mZnNldFsxXVxyXG4gICAgfVxyXG59XHJcblxyXG5cclxubWFwbWFwLnByb3RvdHlwZS5ob3ZlciA9IGZ1bmN0aW9uKG92ZXJDQiwgb3V0Q0IsIG9wdGlvbnMpIHtcclxuXHJcbiAgICBvcHRpb25zID0gZGQubWVyZ2Uoe1xyXG4gICAgICAgIG1vdmVUb0Zyb250OiB0cnVlLFxyXG4gICAgICAgIGNsaXBUb1ZpZXdwb3J0OiB0cnVlLFxyXG4gICAgICAgIGNsaXBNYXJnaW5zOiB7dG9wOiA0MCwgbGVmdDogNDAsIGJvdHRvbTogMCwgcmlnaHQ6IDQwfSxcclxuICAgICAgICBzZWxlY3Rpb246IG51bGwsXHJcbiAgICAgICAgYW5jaG9yUG9zaXRpb246IHRoaXMuZ2V0QW5jaG9yRm9yUmVwclxyXG4gICAgIH0sIG9wdGlvbnMpO1xyXG4gICAgXHJcbiAgICB2YXIgbWFwID0gdGhpcztcclxuICAgIFxyXG4gICAgaWYgKCF0aGlzLl9vbGRQb2ludGVyRXZlbnRzKSB7XHJcbiAgICAgICAgdGhpcy5fb2xkUG9pbnRlckV2ZW50cyA9IFtdO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICB0aGlzLnByb21pc2VfZGF0YSgpLnRoZW4oZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgdmFyIG9iaiA9IG1hcC5nZXRSZXByZXNlbnRhdGlvbnMob3B0aW9ucy5zZWxlY3Rpb24pO1xyXG4gICAgICAgIG1vdXNlb3ZlciA9IGZ1bmN0aW9uKGQpIHtcclxuICAgICAgICAgICAgLy8gXCJ0aGlzXCIgaXMgdGhlIFNWRyBlbGVtZW50LCBub3QgdGhlIG1hcCFcclxuICAgICAgICAgICAgLy8gbW92ZSB0byB0b3AgPSBlbmQgb2YgcGFyZW50IG5vZGVcclxuICAgICAgICAgICAgLy8gdGhpcyBzY3Jld3MgdXAgSUUgZXZlbnQgaGFuZGxpbmchXHJcbiAgICAgICAgICAgIGlmIChvcHRpb25zLm1vdmVUb0Zyb250ICYmIG1hcC5zdXBwb3J0cy5ob3ZlckRvbU1vZGlmaWNhdGlvbikge1xyXG4gICAgICAgICAgICAgICAgLy8gVE9ETzogdGhpcyBzaG91bGQgYmUgc29sdmVkIHZpYSBhIHNlY29uZCBlbGVtZW50IHRvIGJlIHBsYWNlZCBpbiBmcm9udCFcclxuICAgICAgICAgICAgICAgIHRoaXMuX19ob3Zlcmluc2VydHBvc2l0aW9uX18gPSB0aGlzLm5leHRTaWJsaW5nO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5wYXJlbnROb2RlLmFwcGVuZENoaWxkKHRoaXMpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB2YXIgZWwgPSB0aGlzLFxyXG4gICAgICAgICAgICAgICAgZXZlbnQgPSBkMy5ldmVudDtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIC8vIEluIEZpcmVmb3ggdGhlIGV2ZW50IHBvc2l0aW9ucyBhcmUgbm90IHBvcHVsYXRlZCBwcm9wZXJseSBpbiBzb21lIGNhc2VzXHJcbiAgICAgICAgICAgIC8vIERlZmVyIGNhbGwgdG8gYWxsb3cgYnJvd3NlciB0byBwb3B1bGF0ZSB0aGUgZXZlbnRcclxuICAgICAgICAgICAgd2luZG93LnNldFRpbWVvdXQoZnVuY3Rpb24oKXtcclxuICAgICAgICAgICAgICAgIHZhciBhbmNob3IgPSBvcHRpb25zLmFuY2hvclBvc2l0aW9uLmNhbGwobWFwLCBldmVudCwgZWwsIG9wdGlvbnMpOyAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBvdmVyQ0IuY2FsbChtYXAsIGQucHJvcGVydGllcywgYW5jaG9yLCBlbCk7ICAgXHJcbiAgICAgICAgICAgIH0sIDEwKTtcclxuICAgICAgICB9O1xyXG4gICAgICAgIC8vIHJlc2V0IHByZXZpb3VzbHkgb3ZlcnJpZGRlbiBwb2ludGVyIGV2ZW50c1xyXG4gICAgICAgIGZvciAodmFyIGk9MDsgaTxtYXAuX29sZFBvaW50ZXJFdmVudHMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgdmFyIHBhaXIgPSBtYXAuX29sZFBvaW50ZXJFdmVudHNbaV07XHJcbiAgICAgICAgICAgIHBhaXJbMF0uc3R5bGUoJ3BvaW50ZXItZXZlbnRzJywgcGFpclsxXSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIG1hcC5fb2xkUG9pbnRlckV2ZW50cyA9IFtdO1xyXG4gICAgICAgIGlmIChvdmVyQ0IpIHtcclxuICAgICAgICAgICAgb2JqXHJcbiAgICAgICAgICAgICAgICAub24oJ21vdXNlZW50ZXInLCBtb3VzZW92ZXIpXHJcbiAgICAgICAgICAgICAgICAuZWFjaChmdW5jdGlvbigpe1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIFRPRE86IG5vdCBzdXJlIGlmIHRoaXMgaXMgdGhlIGJlc3QgaWRlYSwgYnV0IHdlIG5lZWQgdG8gbWFrZSBzdXJlXHJcbiAgICAgICAgICAgICAgICAgICAgLy8gdG8gcmVjZWl2ZSBwb2ludGVyIGV2ZW50cyBldmVuIGlmIGNzcyBkaXNhYmxlcyB0aGVtLiBUaGlzIGhhcyB0byB3b3JrXHJcbiAgICAgICAgICAgICAgICAgICAgLy8gZXZlbiBmb3IgY29tcGxleCAoZnVuY3Rpb24tYmFzZWQpIHNlbGVjdGlvbnMsIHNvIHdlIGNhbm5vdCB1c2UgY29udGFpbm1lbnRcclxuICAgICAgICAgICAgICAgICAgICAvLyBzZWxlY3RvcnMgKGUuZy4gLnNlbGVjdGVkLWZvbyAuZm9vKSBmb3IgdGhpcy4uLlxyXG4gICAgICAgICAgICAgICAgICAgIC8vIGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL1NWRy9BdHRyaWJ1dGUvcG9pbnRlci1ldmVudHNcclxuICAgICAgICAgICAgICAgICAgICB2YXIgc2VsID0gZDMuc2VsZWN0KHRoaXMpO1xyXG4gICAgICAgICAgICAgICAgICAgIG1hcC5fb2xkUG9pbnRlckV2ZW50cy5wdXNoKFtzZWwsIHNlbC5zdHlsZSgncG9pbnRlci1ldmVudHMnKV0pO1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIFRPRE86IHRoaXMgc2hvdWxkIGJlIGNvbmZpZ3VyYWJsZSB2aWEgb3B0aW9uc1xyXG4gICAgICAgICAgICAgICAgICAgIC8vc2VsLnN0eWxlKCdwb2ludGVyLWV2ZW50cycsJ2FsbCcpO1xyXG4gICAgICAgICAgICAgICAgICAgIHNlbC5zdHlsZSgncG9pbnRlci1ldmVudHMnLCd2aXNpYmxlUGFpbnRlZCcpO1xyXG4gICAgICAgICAgICAgICAgfSlcclxuICAgICAgICAgICAgO1xyXG4gICAgICAgIH1cclxuICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgb2JqLm9uKCdtb3VzZWVudGVyJywgbnVsbCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChvdXRDQikge1xyXG4gICAgICAgICAgICBvYmoub24oJ21vdXNlbGVhdmUnLCBmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLl9faG92ZXJpbnNlcnRwb3NpdGlvbl9fKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wYXJlbnROb2RlLmluc2VydEJlZm9yZSh0aGlzLCB0aGlzLl9faG92ZXJpbnNlcnRwb3NpdGlvbl9fKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIC8vIHdlIG5lZWQgdG8gZGVmZXIgdGhpcyBjYWxsIGFzIHdlbGwgdG8gbWFrZSBzdXJlIGl0IGlzXHJcbiAgICAgICAgICAgICAgICAvLyBhbHdheXMgY2FsbGVkIGFmdGVyIG92ZXJDQiAoc2VlIGFib3ZlIEZmeCB3b3JrYXJvdW5kKVxyXG4gICAgICAgICAgICAgICAgd2luZG93LnNldFRpbWVvdXQoZnVuY3Rpb24oKXtcclxuICAgICAgICAgICAgICAgICAgICBvdXRDQi5jYWxsKG1hcCk7ICAgXHJcbiAgICAgICAgICAgICAgICB9LCAxMCk7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICBob3Zlck91dENhbGxiYWNrcy5wdXNoKG91dENCKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgIG9iai5vbignbW91c2VsZWF2ZScsIG51bGwpO1xyXG4gICAgICAgIH0gICAgICAgICAgXHJcbiAgICB9KTtcclxuICAgIHJldHVybiB0aGlzO1xyXG59O1xyXG5cclxubWFwbWFwLnByb3RvdHlwZS5mb3JtYXRWYWx1ZSA9IGZ1bmN0aW9uKGQsIGF0dHIpIHtcclxuICAgIHZhciBtZXRhID0gdGhpcy5nZXRNZXRhZGF0YShhdHRyKSxcclxuICAgICAgICB2YWwgPSBtZXRhLmZvcm1hdChkW2F0dHJdKTtcclxuICAgIGlmICh2YWwgPT0gJ05hTicpIHZhbCA9IGRbYXR0cl07XHJcbiAgICByZXR1cm4gdmFsO1xyXG59O1xyXG5cclxubWFwbWFwLnByb3RvdHlwZS5idWlsZEhUTUxGdW5jID0gZnVuY3Rpb24oc3BlYykge1xyXG4gICAgLy8gZnVuY3Rpb24gY2FzZVxyXG4gICAgaWYgKHR5cGVvZiBzcGVjID09ICdmdW5jdGlvbicpIHJldHVybiBzcGVjO1xyXG4gICAgLy8gc3RyaW5nIGNhc2VcclxuICAgIGlmIChzcGVjLnN1YnN0cikgc3BlYyA9IFtzcGVjXTtcclxuICAgIFxyXG4gICAgdmFyIG1hcCA9IHRoaXM7XHJcbiAgICBcclxuICAgIHZhciBmdW5jID0gZnVuY3Rpb24oZCkge1xyXG4gICAgICAgIHZhciBodG1sID0gXCJcIixcclxuICAgICAgICAgICAgcHJlLCBwb3N0O1xyXG4gICAgICAgIGZvciAodmFyIGk9MDsgaTxzcGVjLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgIHZhciBwYXJ0ID0gc3BlY1tpXTtcclxuICAgICAgICAgICAgaWYgKHBhcnQpIHtcclxuICAgICAgICAgICAgICAgIHByZSA9IChpPT0wKSA/ICc8Yj4nIDogJyc7XHJcbiAgICAgICAgICAgICAgICBwb3N0ID0gKGk9PTApID8gJzwvYj48YnI+JyA6ICc8YnI+JztcclxuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgcGFydCA9PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdmFyIHN0ciA9IHBhcnQuY2FsbChtYXAsIGQpO1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChzdHIpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaHRtbCArPSBwcmUgKyBzdHIgKyBwb3N0O1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHZhciBtZXRhID0gbWFwLmdldE1ldGFkYXRhKHBhcnQpO1xyXG4gICAgICAgICAgICAgICAgdmFyIHByZWZpeCA9IG1ldGEuaG92ZXJMYWJlbCB8fCBtZXRhLnZhbHVlTGFiZWwgfHwgbWV0YS5sYWJlbCB8fCAnJztcclxuICAgICAgICAgICAgICAgIGlmIChwcmVmaXgpIHByZWZpeCArPSBcIjogXCI7XHJcbiAgICAgICAgICAgICAgICB2YXIgdmFsID0gbWV0YS5mb3JtYXQoZFtwYXJ0XSk7XHJcbiAgICAgICAgICAgICAgICBpZiAodmFsID09ICdOYU4nKSB2YWwgPSBkW3BhcnRdO1xyXG4gICAgICAgICAgICAgICAgLy8gVE9ETzogbWFrZSBvcHRpb24gXCJpZ25vcmVVbmRlZmluZWRcIiBldGMuXHJcbiAgICAgICAgICAgICAgICBpZiAodmFsICE9PSB1bmRlZmluZWQgJiYgdmFsICE9PSBtZXRhLnVuZGVmaW5lZFZhbHVlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaHRtbCArPSBwcmUgKyBwcmVmaXggKyB2YWwgKyAoIG1ldGEudmFsdWVVbml0ID8gJyZuYnNwOycgKyBtZXRhLnZhbHVlVW5pdCA6ICcnKSArIHBvc3Q7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBlbHNlIGlmIChtZXRhLnVuZGVmaW5lZExhYmVsKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaHRtbCArPSBwcmUgKyBwcmVmaXggKyBtZXRhLnVuZGVmaW5lZExhYmVsICsgcG9zdDtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gaHRtbDtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHJldHVybiBmdW5jO1xyXG59O1xyXG5cclxubWFwbWFwLnByb3RvdHlwZS5ob3ZlckluZm8gPSBmdW5jdGlvbihzcGVjLCBvcHRpb25zKSB7XHJcblxyXG4gICAgb3B0aW9ucyA9IGRkLm1lcmdlKHtcclxuICAgICAgICBzZWxlY3Rpb246IG51bGwsXHJcbiAgICAgICAgaG92ZXJDbGFzc05hbWU6ICdob3ZlckluZm8nLFxyXG4gICAgICAgIGhvdmVyU3R5bGU6IHtcclxuICAgICAgICAgICAgcG9zaXRpb246ICdhYnNvbHV0ZScsXHJcbiAgICAgICAgICAgIHBhZGRpbmc6ICcwLjVlbSAwLjdlbScsXHJcbiAgICAgICAgICAgICdiYWNrZ3JvdW5kLWNvbG9yJzogJ3JnYmEoMjU1LDI1NSwyNTUsMC44NSknLFxyXG4gICAgICAgICAgICAvLyBhdm9pZCBjbGlwcGluZyBESVYgdG8gcmlnaHQgZWRnZSBvZiBtYXAgXHJcbiAgICAgICAgICAgICd3aGl0ZS1zcGFjZSc6ICdub3dyYXAnLFxyXG4gICAgICAgICAgICAnei1pbmRleCc6ICcyJ1xyXG4gICAgICAgIH0sXHJcbiAgICAgICAgaG92ZXJFbnRlclN0eWxlOiB7XHJcbiAgICAgICAgICAgIGRpc3BsYXk6ICdibG9jaydcclxuICAgICAgICB9LFxyXG4gICAgICAgIGhvdmVyTGVhdmVTdHlsZToge1xyXG4gICAgICAgICAgICBkaXNwbGF5OiAnbm9uZSdcclxuICAgICAgICB9XHJcbiAgICB9LCBvcHRpb25zKTtcclxuICAgIFxyXG4gICAgdmFyIGhvdmVyRWwgPSB0aGlzLl9lbGVtZW50cy5wYXJlbnQuc2VsZWN0KCcuJyArIG9wdGlvbnMuaG92ZXJDbGFzc05hbWUpO1xyXG5cclxuICAgIGlmICghc3BlYykge1xyXG4gICAgICAgIHJldHVybiB0aGlzLmhvdmVyKG51bGwsIG51bGwsIG9wdGlvbnMpO1xyXG4gICAgfVxyXG5cclxuICAgIHZhciBodG1sRnVuYyA9IHRoaXMuYnVpbGRIVE1MRnVuYyhzcGVjKTtcclxuICAgIGlmIChob3ZlckVsLmVtcHR5KCkpIHtcclxuICAgICAgICBob3ZlckVsID0gdGhpcy5fZWxlbWVudHMucGFyZW50LmFwcGVuZCgnZGl2JykuYXR0cignY2xhc3MnLG9wdGlvbnMuaG92ZXJDbGFzc05hbWUpO1xyXG4gICAgfVxyXG4gICAgaG92ZXJFbC5zdHlsZShvcHRpb25zLmhvdmVyU3R5bGUpO1xyXG4gICAgaWYgKCFob3ZlckVsLm1hcG1hcF9ldmVudEhhbmRsZXJJbnN0YWxsZWQpIHtcclxuICAgICAgICBob3ZlckVsLm9uKCdtb3VzZWVudGVyJywgZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgIGhvdmVyRWwuc3R5bGUob3B0aW9ucy5ob3ZlckVudGVyU3R5bGUpO1xyXG4gICAgICAgIH0pLm9uKCdtb3VzZWxlYXZlJywgZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgIGhvdmVyRWwuc3R5bGUob3B0aW9ucy5ob3ZlckxlYXZlU3R5bGUpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGhvdmVyRWwubWFwbWFwX2V2ZW50SGFuZGxlckluc3RhbGxlZCA9IHRydWU7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIHNob3coZCwgcG9pbnQpe1xyXG4gICAgICAgIC8vIG9mZnNldFBhcmVudCBvbmx5IHdvcmtzIGZvciByZW5kZXJlZCBvYmplY3RzLCBzbyBwbGFjZSBvYmplY3QgZmlyc3QhXHJcbiAgICAgICAgLy8gaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvQVBJL0hUTUxFbGVtZW50Lm9mZnNldFBhcmVudFxyXG4gICAgICAgIGhvdmVyRWwuc3R5bGUob3B0aW9ucy5ob3ZlckVudGVyU3R5bGUpOyAgXHJcbiAgICAgICAgXHJcbiAgICAgICAgdmFyIG9mZnNldEVsID0gaG92ZXJFbC5ub2RlKCkub2Zmc2V0UGFyZW50IHx8IGhvdmVyRWwsXHJcbiAgICAgICAgICAgIG1haW5FbCA9IHRoaXMuX2VsZW1lbnRzLm1haW4ubm9kZSgpLFxyXG4gICAgICAgICAgICBib3VuZHMgPSB0aGlzLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpLFxyXG4gICAgICAgICAgICBvZmZzZXRCb3VuZHMgPSBvZmZzZXRFbC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKSxcclxuICAgICAgICAgICAgc2Nyb2xsVG9wID0gd2luZG93LnBhZ2VZT2Zmc2V0IHx8IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5zY3JvbGxUb3AgfHwgZG9jdW1lbnQuYm9keS5zY3JvbGxUb3AgfHwgMCxcclxuICAgICAgICAgICAgc2Nyb2xsTGVmdCA9IHdpbmRvdy5wYWdlWE9mZnNldCB8fCBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuc2Nyb2xsTGVmdCB8fCBkb2N1bWVudC5ib2R5LnNjcm9sbExlZnQgfHwgMCxcclxuICAgICAgICAgICAgdG9wID0gYm91bmRzLnRvcCAtIG9mZnNldEJvdW5kcy50b3AsXHJcbiAgICAgICAgICAgIGxlZnQgPSBib3VuZHMubGVmdCAtIG9mZnNldEJvdW5kcy5sZWZ0O1xyXG5cclxuICAgICAgICBob3ZlckVsXHJcbiAgICAgICAgICAgIC5zdHlsZSh7XHJcbiAgICAgICAgICAgICAgICBib3R0b206IChvZmZzZXRCb3VuZHMuaGVpZ2h0IC0gdG9wIC0gcG9pbnQueSkgKyAncHgnLFxyXG4gICAgICAgICAgICAgICAgLy90b3A6IHBvaW50LnkgKyAncHgnLFxyXG4gICAgICAgICAgICAgICAgbGVmdDogKGxlZnQgKyBwb2ludC54KSArICdweCdcclxuICAgICAgICAgICAgfSlcclxuICAgICAgICAgICAgLmh0bWwoaHRtbEZ1bmMoZCkpO1xyXG4gICAgfVxyXG4gICAgZnVuY3Rpb24gaGlkZSgpIHtcclxuICAgICAgICBob3ZlckVsLnN0eWxlKG9wdGlvbnMuaG92ZXJMZWF2ZVN0eWxlKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgcmV0dXJuIHRoaXMuaG92ZXIoc2hvdywgaGlkZSwgb3B0aW9ucyk7XHJcbn07XHJcblxyXG4vLyByZW1vdmUgYWxsIHN5bWJvbG9neVxyXG4vLyBUT0RPOiBzeW1ib2xpemVycyBzaG91bGQgYmUgcmVnaXN0ZXJlZCBzb21laG93IGFuZCBpdGVyYXRlZCBvdmVyIGhlcmVcclxubWFwbWFwLnByb3RvdHlwZS5jbGVhciA9IGZ1bmN0aW9uKCkge1xyXG4gICAgdGhpcy5jaG9yb3BsZXRoKG51bGwpO1xyXG4gICAgdGhpcy5wcm9wb3J0aW9uYWxfY2lyY2xlcyhudWxsKTtcclxuICAgIHRoaXMudGl0bGUobnVsbCk7XHJcbiAgICB0aGlzLmRlc2MobnVsbCk7XHJcbiAgICByZXR1cm4gdGhpcztcclxufTtcclxuXHJcbi8vIG5hbWVzcGFjZSBmb3IgcmUtdXNhYmxlIGJlaGF2aW9yc1xyXG5tYXBtYXAuYmVoYXZpb3IgPSB7fTtcclxuXHJcbm1hcG1hcC5iZWhhdmlvci56b29tID0gZnVuY3Rpb24ob3B0aW9ucykge1xyXG5cclxuICAgIG9wdGlvbnMgPSBkZC5tZXJnZSh7XHJcbiAgICAgICAgZXZlbnQ6ICdjbGljaycsXHJcbiAgICAgICAgY3Vyc29yOiAncG9pbnRlcicsXHJcbiAgICAgICAgZml0U2NhbGU6IDAuNyxcclxuICAgICAgICBhbmltYXRpb25EdXJhdGlvbjogNzUwLFxyXG4gICAgICAgIG1heFpvb206IDgsXHJcbiAgICAgICAgaGllcmFyY2hpY2FsOiBmYWxzZSxcclxuICAgICAgICBzaG93UmluZzogdHJ1ZSxcclxuICAgICAgICByaW5nUmFkaXVzOiAxLjEsIC8vIHJlbGF0aXZlIHRvIGhlaWdodC8yXHJcbiAgICAgICAgem9vbXN0YXJ0OiBudWxsLFxyXG4gICAgICAgIHpvb21lbmQ6IG51bGwsXHJcbiAgICAgICAgY2VudGVyOiBbY2VudGVyLngsIGNlbnRlci55XSxcclxuICAgICAgICByaW5nQXR0cmlidXRlczoge1xyXG4gICAgICAgICAgICBzdHJva2U6ICcjMDAwJyxcclxuICAgICAgICAgICAgJ3N0cm9rZS13aWR0aCc6IDYsXHJcbiAgICAgICAgICAgICdzdHJva2Utb3BhY2l0eSc6IDAuMyxcclxuICAgICAgICAgICAgJ3BvaW50ZXItZXZlbnRzJzogJ25vbmUnLFxyXG4gICAgICAgICAgICBmaWxsOiAnbm9uZSdcclxuICAgICAgICB9LFxyXG4gICAgICAgIGNsb3NlQnV0dG9uOiBmdW5jdGlvbihwYXJlbnQpIHtcclxuICAgICAgICAgICAgcGFyZW50LmFwcGVuZCgnY2lyY2xlJylcclxuICAgICAgICAgICAgICAgIC5hdHRyKHtcclxuICAgICAgICAgICAgICAgICAgICByOiAxMCxcclxuICAgICAgICAgICAgICAgICAgICBmaWxsOiAnI2ZmZicsXHJcbiAgICAgICAgICAgICAgICAgICAgc3Ryb2tlOiAnIzAwMCcsXHJcbiAgICAgICAgICAgICAgICAgICAgJ3N0cm9rZS13aWR0aCc6IDIuNSxcclxuICAgICAgICAgICAgICAgICAgICAnc3Ryb2tlLW9wYWNpdHknOiAwLjksXHJcbiAgICAgICAgICAgICAgICAgICAgJ2ZpbGwtb3BhY2l0eSc6IDAuOSxcclxuICAgICAgICAgICAgICAgICAgICBjdXJzb3I6ICdwb2ludGVyJ1xyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgcGFyZW50LmFwcGVuZCgndGV4dCcpXHJcbiAgICAgICAgICAgICAgICAuYXR0cih7XHJcbiAgICAgICAgICAgICAgICAgICAgJ3RleHQtYW5jaG9yJzonbWlkZGxlJyxcclxuICAgICAgICAgICAgICAgICAgICBjdXJzb3I6ICdwb2ludGVyJyxcclxuICAgICAgICAgICAgICAgICAgICAnZm9udC13ZWlnaHQnOiAnYm9sZCcsXHJcbiAgICAgICAgICAgICAgICAgICAgJ2ZvbnQtc2l6ZSc6ICcxOCcsXHJcbiAgICAgICAgICAgICAgICAgICAgeTogNlxyXG4gICAgICAgICAgICAgICAgfSlcclxuICAgICAgICAgICAgICAgIC50ZXh0KCfDlycpO1xyXG4gICAgICAgIH0sXHJcbiAgICAgICAgLy8gVE9ETzogaG93IHNob3VsZCBoaWdobGlnaHRpbmcgd29yayBvbiB0aGUgbWFwIGdlbmVyYWxseT9cclxuICAgICAgICAvLyBtYXliZSBtb3JlIGxpa2Ugc2V0U3RhdGUoJ2hpZ2hsaWdodCcpIGFuZCBvcHRpb25zLmFjdGl2ZXN0eWxlID0gJ2hpZ2hsaWdodCcgP1xyXG4gICAgICAgIGFjdGl2YXRlOiBmdW5jdGlvbihlbCkge1xyXG4gICAgICAgICAgICBkMy5zZWxlY3QoZWwpLmNsYXNzZWQoJ2FjdGl2ZScsIHRydWUpO1xyXG4gICAgICAgIH0sXHJcbiAgICAgICAgZGVhY3RpdmF0ZTogZnVuY3Rpb24oZWwpIHtcclxuICAgICAgICAgICAgaWYgKGVsKSBkMy5zZWxlY3QoZWwpLmNsYXNzZWQoJ2FjdGl2ZScsIGZhbHNlKTtcclxuICAgICAgICB9ICAgICAgICBcclxuICAgIH0sIG9wdGlvbnMpO1xyXG4gICAgXHJcbiAgICB2YXIgcmluZyA9IG51bGwsXHJcbiAgICAgICAgbWFwID0gbnVsbCxcclxuICAgICAgICByLCByMCxcclxuICAgICAgICB6b29tZWQgPSBudWxsO1xyXG4gICAgXHJcbiAgICB2YXIgeiA9IGZ1bmN0aW9uKHNlbGVjdGlvbikge1xyXG4gICAgICAgICAgICBcclxuICAgICAgICBtYXAgPSB0aGlzO1xyXG5cclxuICAgICAgICB2YXIgc2l6ZSA9IHRoaXMuc2l6ZSgpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIHIgPSBNYXRoLm1pbihzaXplLmhlaWdodCwgc2l6ZS53aWR0aCkgLyAyLjAgKiBvcHRpb25zLnJpbmdSYWRpdXM7XHJcbiAgICAgICAgcjAgPSBNYXRoLnNxcnQoc2l6ZS53aWR0aCpzaXplLndpZHRoICsgc2l6ZS5oZWlnaHQqc2l6ZS5oZWlnaHQpIC8gMS41O1xyXG4gICAgICAgICAgICBcclxuICAgICAgICBpZiAob3B0aW9ucy5jdXJzb3IpIHtcclxuICAgICAgICAgICAgc2VsZWN0aW9uLmF0dHIoe1xyXG4gICAgICAgICAgICAgICAgY3Vyc29yOiBvcHRpb25zLmN1cnNvclxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKG9wdGlvbnMuc2hvd1JpbmcgJiYgIXJpbmcpIHtcclxuICAgICAgICAgICAgcmluZyA9IG1hcC5fZWxlbWVudHMuZml4ZWQuc2VsZWN0QWxsKCdnLnpvb21SaW5nJylcclxuICAgICAgICAgICAgICAgIC5kYXRhKFsxXSk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB2YXIgbmV3cmluZyA9IHJpbmcuZW50ZXIoKVxyXG4gICAgICAgICAgICAgICAgLmFwcGVuZCgnZycpXHJcbiAgICAgICAgICAgICAgICAuYXR0cignY2xhc3MnLCd6b29tUmluZycpXHJcbiAgICAgICAgICAgICAgICAuYXR0cigndHJhbnNmb3JtJywndHJhbnNsYXRlKCcgKyBzaXplLndpZHRoICogb3B0aW9ucy5jZW50ZXJbMF0gKyAnLCcgKyBzaXplLmhlaWdodCAqIG9wdGlvbnMuY2VudGVyWzFdICsgJyknKTtcclxuICAgICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgbmV3cmluZy5hcHBlbmQoJ2NpcmNsZScpXHJcbiAgICAgICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnbWFpbicpXHJcbiAgICAgICAgICAgICAgICAuYXR0cigncicsIHIwKVxyXG4gICAgICAgICAgICAgICAgLmF0dHIob3B0aW9ucy5yaW5nQXR0cmlidXRlcyk7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgdmFyIGNsb3NlID0gbmV3cmluZy5hcHBlbmQoJ2cnKVxyXG4gICAgICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywnem9vbU91dCcpXHJcbiAgICAgICAgICAgICAgICAuYXR0cigndHJhbnNmb3JtJywndHJhbnNsYXRlKCcgKyAocjAgKiAwLjcwNykgKyAnLC0nICsgKHIwICogMC43MDcpICsgJyknKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChvcHRpb25zLmNsb3NlQnV0dG9uKSB7XHJcbiAgICAgICAgICAgICAgICBvcHRpb25zLmNsb3NlQnV0dG9uKGNsb3NlKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIHRoaXMgaXMgY3VycmVudGx5IG5lZWRlZCBpZiBlLmcuIHNlYXJjaCB6b29tcyB0byBzb21ld2hlcmUgZWxzZSxcclxuICAgICAgICAvLyBidXQgbWFwIGlzIHN0aWxsIHpvb21lZCBpbiB0aHJvdWdoIHRoaXMgYmVoYXZpb3JcclxuICAgICAgICAvLyBkbyBhIHJlc2V0KCksIGJ1dCB3aXRob3V0IG1vZGlmeWluZyB0aGUgbWFwIHZpZXcgKD16b29taW5nIG91dClcclxuICAgICAgICBtYXAub24oJ3ZpZXcnLCBmdW5jdGlvbih0cmFuc2xhdGUsIHNjYWxlKSB7XHJcbiAgICAgICAgICAgIGlmICh6b29tZWQgJiYgc2NhbGUgPT0gMSkge1xyXG4gICAgICAgICAgICAgICAgem9vbWVkID0gbnVsbDtcclxuICAgICAgICAgICAgICAgIGFuaW1hdGVSaW5nKG51bGwpO1xyXG4gICAgICAgICAgICAgICAgbWFwLl9lbGVtZW50cy5tYXAuc2VsZWN0KCcuYmFja2dyb3VuZCcpLm9uKG9wdGlvbnMuZXZlbnQgKyAnLnpvb20nLCBudWxsKTtcclxuICAgICAgICAgICAgICAgIG9wdGlvbnMuem9vbXN0YXJ0ICYmIG9wdGlvbnMuem9vbXN0YXJ0LmNhbGwobWFwLCBudWxsKTtcclxuICAgICAgICAgICAgICAgIG9wdGlvbnMuem9vbWVuZCAmJiBvcHRpb25zLnpvb21lbmQuY2FsbChtYXAsIG51bGwpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICBzZWxlY3Rpb24ub24ob3B0aW9ucy5ldmVudCwgZnVuY3Rpb24oZCkge1xyXG4gICAgICAgICAgICBjYWxsSG92ZXJPdXQoKTtcclxuICAgICAgICAgICAgaWYgKHpvb21lZCA9PSB0aGlzKSB7XHJcbiAgICAgICAgICAgICAgICByZXNldCgpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgb3B0aW9ucy5kZWFjdGl2YXRlKHpvb21lZCk7XHJcbiAgICAgICAgICAgICAgICB2YXIgZWwgPSB0aGlzO1xyXG4gICAgICAgICAgICAgICAgb3B0aW9ucy56b29tc3RhcnQgJiYgb3B0aW9ucy56b29tc3RhcnQuY2FsbChtYXAsIGVsKTtcclxuICAgICAgICAgICAgICAgIG1hcC56b29tVG9TZWxlY3Rpb24odGhpcywge1xyXG4gICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrOiBmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgb3B0aW9ucy56b29tZW5kICYmIG9wdGlvbnMuem9vbWVuZC5jYWxsKG1hcCwgZWwpO1xyXG4gICAgICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICAgICAgbWF4Wm9vbTogb3B0aW9ucy5tYXhab29tLFxyXG4gICAgICAgICAgICAgICAgICAgIGNlbnRlcjogb3B0aW9ucy5jZW50ZXJcclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgYW5pbWF0ZVJpbmcodGhpcyk7XHJcbiAgICAgICAgICAgICAgICBvcHRpb25zLmFjdGl2YXRlKHRoaXMpO1xyXG4gICAgICAgICAgICAgICAgem9vbWVkID0gdGhpcztcclxuICAgICAgICAgICAgICAgIG1hcC5fZWxlbWVudHMubWFwLnNlbGVjdCgnLmJhY2tncm91bmQnKS5vbihvcHRpb25zLmV2ZW50ICsgJy56b29tJywgcmVzZXQpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGlmICh6b29tZWQpIHtcclxuICAgICAgICAgICAgb3B0aW9ucy56b29tc3RhcnQgJiYgb3B0aW9ucy56b29tc3RhcnQuY2FsbChtYXAsIHpvb21lZCk7XHJcbiAgICAgICAgICAgIG9wdGlvbnMuem9vbWVuZCAmJiBvcHRpb25zLnpvb21lbmQuY2FsbChtYXAsIHpvb21lZCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgIH07XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIHpvb21UbyhzZWxlY3Rpb24pIHtcclxuICAgICAgICBvcHRpb25zLnpvb21zdGFydCAmJiBvcHRpb25zLnpvb21zdGFydC5jYWxsKG1hcCwgc2VsZWN0aW9uKTtcclxuICAgICAgICBtYXAuem9vbVRvU2VsZWN0aW9uKHNlbGVjdGlvbiwge1xyXG4gICAgICAgICAgICBjYWxsYmFjazogZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgICAgICBvcHRpb25zLnpvb21lbmQgJiYgb3B0aW9ucy56b29tZW5kLmNhbGwobWFwLCBzZWxlY3Rpb24pO1xyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICBtYXhab29tOiBvcHRpb25zLm1heFpvb20sXHJcbiAgICAgICAgICAgIGNlbnRlcjogb3B0aW9ucy5jZW50ZXJcclxuICAgICAgICB9KTtcclxuICAgICAgICBhbmltYXRlUmluZyhzZWxlY3Rpb24pO1xyXG4gICAgICAgIHpvb21lZCA9IHNlbGVjdGlvbjtcclxuICAgICAgICBtYXAuX2VsZW1lbnRzLm1hcC5zZWxlY3QoJy5iYWNrZ3JvdW5kJykub24ob3B0aW9ucy5ldmVudCArICcuem9vbScsIHJlc2V0KTtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbiBhbmltYXRlUmluZyhzZWxlY3Rpb24pIHtcclxuICAgICAgICBpZiAocmluZykge1xyXG4gICAgICAgICAgICB2YXIgbmV3X3IgPSAoc2VsZWN0aW9uKSA/IHIgOiByMDtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHJpbmcuc2VsZWN0KCdjaXJjbGUubWFpbicpLnRyYW5zaXRpb24oKS5kdXJhdGlvbihvcHRpb25zLmFuaW1hdGlvbkR1cmF0aW9uKVxyXG4gICAgICAgICAgICAgICAgLmF0dHIoe1xyXG4gICAgICAgICAgICAgICAgICAgIHI6IG5ld19yXHJcbiAgICAgICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICA7XHJcbiAgICAgICAgICAgIHJpbmcuc2VsZWN0KCdnLnpvb21PdXQnKS50cmFuc2l0aW9uKCkuZHVyYXRpb24ob3B0aW9ucy5hbmltYXRpb25EdXJhdGlvbilcclxuICAgICAgICAgICAgICAgIC5hdHRyKCd0cmFuc2Zvcm0nLCAndHJhbnNsYXRlKCcgKyAobmV3X3IgKiAwLjcwNykgKyAnLC0nICsgKG5ld19yICogMC43MDcpICsgJyknKTsgLy8gc3FydCgyKSAvIDJcclxuXHJcbiAgICAgICAgICAgIC8vIGNhdmVhdDogbWFrZSBzdXJlIHRvIGFzc2lnbiB0aGlzIGV2ZXJ5IHRpbWUgdG8gYXBwbHkgY29ycmVjdCBjbG9zdXJlIGlmIHdlIGhhdmUgbXVsdGlwbGUgem9vbSBiZWhhdmlvcnMhIVxyXG4gICAgICAgICAgICByaW5nLnNlbGVjdCgnZy56b29tT3V0Jykub24oJ2NsaWNrJywgcmVzZXQpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgICAgICBcclxuICAgIGZ1bmN0aW9uIHJlc2V0KCkge1xyXG4gICAgICAgIGlmIChtYXApIHtcclxuICAgICAgICAgICAgb3B0aW9ucy5kZWFjdGl2YXRlKHpvb21lZCk7XHJcbiAgICAgICAgICAgIHpvb21lZCA9IG51bGw7XHJcbiAgICAgICAgICAgIG1hcC5yZXNldFpvb20oKTtcclxuICAgICAgICAgICAgYW5pbWF0ZVJpbmcobnVsbCk7XHJcbiAgICAgICAgICAgIG1hcC5fZWxlbWVudHMubWFwLnNlbGVjdCgnLmJhY2tncm91bmQnKS5vbihvcHRpb25zLmV2ZW50ICsgJy56b29tJywgbnVsbCk7XHJcbiAgICAgICAgICAgIGlmIChvcHRpb25zLnpvb21zdGFydCkge1xyXG4gICAgICAgICAgICAgICAgb3B0aW9ucy56b29tc3RhcnQuY2FsbChtYXAsIG51bGwpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmIChvcHRpb25zLnpvb21lbmQpIHtcclxuICAgICAgICAgICAgICAgIG9wdGlvbnMuem9vbWVuZC5jYWxsKG1hcCwgbnVsbCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBcclxuICAgIHoucmVzZXQgPSByZXNldDtcclxuICAgIFxyXG4gICAgei5hY3RpdmUgPSBmdW5jdGlvbigpIHtcclxuICAgICAgICByZXR1cm4gem9vbWVkO1xyXG4gICAgfTsgICBcclxuXHJcbiAgICB6LnJlbW92ZSA9IGZ1bmN0aW9uKCkge1xyXG4gICAgICAgIHJlc2V0KCk7XHJcbiAgICB9O1xyXG4gICAgICAgIFxyXG4gICAgei5mcm9tID0gZnVuY3Rpb24ob3RoZXIpe1xyXG4gICAgICAgIGlmIChvdGhlciAmJiBvdGhlci5hY3RpdmUpIHtcclxuICAgICAgICAgICAgem9vbWVkID0gb3RoZXIuYWN0aXZlKCk7XHJcbiAgICAgICAgICAgIC8qXHJcbiAgICAgICAgICAgIGlmICh6b29tZWQpIHtcclxuICAgICAgICAgICAgICAgIHpvb21Ubyh6b29tZWQpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICovXHJcbiAgICAgICAgICAgIC8vIFRPRE86IG1ha2UgdXAgb3VyIG1pbmQgd2hldGhlciB0aGlzIHNob3VsZCByZW1vdmUgdGhlIG90aGVyIGJlaGF2aW9yXHJcbiAgICAgICAgICAgIC8vIGluIGJ1cmdlbmxhbmRfZGVtb2dyYXBoaWUuaHRtbCwgd2UgbmVlZCB0byBrZWVwIGl0IGFzIGl0IHdvdWxkIG90aGVyd2lzZSB6b29tIG91dFxyXG4gICAgICAgICAgICAvLyBidXQgaWYgd2UgbWl4IGRpZmZlcmVudCBiZWhhdmlvcnMsIHdlIG1heSB3YW50IHRvIHJlbW92ZSB0aGUgb3RoZXIgb25lIGF1dG9tYXRpY2FsbHlcclxuICAgICAgICAgICAgLy8gKG9yIG1heWJlIHJlcXVpcmUgaXQgdG8gYmUgZG9uZSBtYW51YWxseSlcclxuICAgICAgICAgICAgLy8gaW4gcGVuZGVsbi5qcywgd2UgcmVtb3ZlIHRoZSBvdGhlciBiZWhhdmlvciBoZXJlLCB3aGljaCBpcyBpbmNvbnNpc3RlbnQhXHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvL290aGVyLnJlbW92ZSgpO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gejtcclxuICAgIH07XHJcbiAgICBcclxuICAgIHJldHVybiB6O1xyXG59O1xyXG5cclxubWFwbWFwLnByb3RvdHlwZS5hbmltYXRlVmlldyA9IGZ1bmN0aW9uKHRyYW5zbGF0ZSwgc2NhbGUsIGNhbGxiYWNrLCBkdXJhdGlvbikge1xyXG5cclxuICAgIGR1cmF0aW9uID0gZHVyYXRpb24gfHwgNzUwO1xyXG4gICAgXHJcbiAgICBpZiAodHJhbnNsYXRlWzBdID09IHRoaXMuY3VycmVudF90cmFuc2xhdGVbMF0gJiYgdHJhbnNsYXRlWzFdID09IHRoaXMuY3VycmVudF90cmFuc2xhdGVbMV0gJiYgc2NhbGUgPT0gdGhpcy5jdXJyZW50X3NjYWxlKSB7XHJcbiAgICAgICAgLy8gbm90aGluZyB0byBkb1xyXG4gICAgICAgIC8vIHlpZWxkIHRvIHNpbXVsYXRlIGFzeW5jIGNhbGxiYWNrXHJcbiAgICAgICAgaWYgKGNhbGxiYWNrKSB7XHJcbiAgICAgICAgICAgIHdpbmRvdy5zZXRUaW1lb3V0KGNhbGxiYWNrLCAxMCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiB0aGlzO1xyXG4gICAgfVxyXG4gICAgdGhpcy5jdXJyZW50X3RyYW5zbGF0ZSA9IHRyYW5zbGF0ZTtcclxuICAgIHRoaXMuY3VycmVudF9zY2FsZSA9IHNjYWxlO1xyXG4gICAgY2FsbEhvdmVyT3V0KCk7XHJcbiAgICB2YXIgbWFwID0gdGhpcztcclxuICAgIHRoaXMuX2VsZW1lbnRzLm1hcC50cmFuc2l0aW9uKClcclxuICAgICAgICAuZHVyYXRpb24oZHVyYXRpb24pXHJcbiAgICAgICAgLmNhbGwobWFwLnpvb20udHJhbnNsYXRlKHRyYW5zbGF0ZSkuc2NhbGUoc2NhbGUpLmV2ZW50KVxyXG4gICAgICAgIC5lYWNoKCdzdGFydCcsIGZ1bmN0aW9uKCkge1xyXG4gICAgICAgICAgICBtYXAuX2VsZW1lbnRzLnNoYWRvd0dyb3VwLmF0dHIoJ2Rpc3BsYXknLCdub25lJyk7XHJcbiAgICAgICAgfSlcclxuICAgICAgICAuZWFjaCgnZW5kJywgZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgIG1hcC5fZWxlbWVudHMuc2hhZG93R3JvdXAuYXR0cignZGlzcGxheScsJ2Jsb2NrJyk7XHJcbiAgICAgICAgICAgIGlmIChjYWxsYmFjaykge1xyXG4gICAgICAgICAgICAgICAgY2FsbGJhY2soKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pXHJcbiAgICAgICAgLmVhY2goJ2ludGVycnVwdCcsIGZ1bmN0aW9uKCkge1xyXG4gICAgICAgICAgICBtYXAuX2VsZW1lbnRzLnNoYWRvd0dyb3VwLmF0dHIoJ2Rpc3BsYXknLCdibG9jaycpO1xyXG4gICAgICAgICAgICAvLyBub3Qgc3VyZSBpZiB3ZSBzaG91bGQgY2FsbCBjYWxsYmFjayBoZXJlLCBidXQgaXQgbWF5IGJlIG5vbi1pbnR1aXRpdmVcclxuICAgICAgICAgICAgLy8gZm9yIGNhbGxiYWNrIHRvIG5ldmVyIGJlIGNhbGxlZCBpZiB6b29tIGlzIGNhbmNlbGxlZFxyXG4gICAgICAgICAgICBpZiAoY2FsbGJhY2spIHtcclxuICAgICAgICAgICAgICAgIGNhbGxiYWNrKCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTsgICAgICAgIFxyXG4gICAgdGhpcy5kaXNwYXRjaGVyLnZpZXcuY2FsbCh0aGlzLCB0cmFuc2xhdGUsIHNjYWxlKTtcclxuICAgIHJldHVybiB0aGlzO1xyXG59O1xyXG5cclxubWFwbWFwLnByb3RvdHlwZS5zZXRWaWV3ID0gZnVuY3Rpb24odHJhbnNsYXRlLCBzY2FsZSkge1xyXG5cclxuICAgIHRyYW5zbGF0ZSA9IHRyYW5zbGF0ZSB8fCB0aGlzLmN1cnJlbnRfdHJhbnNsYXRlO1xyXG4gICAgc2NhbGUgPSBzY2FsZSB8fCB0aGlzLmN1cnJlbnRfc2NhbGU7XHJcbiAgICBcclxuICAgIHRoaXMuY3VycmVudF90cmFuc2xhdGUgPSB0cmFuc2xhdGU7XHJcbiAgICB0aGlzLmN1cnJlbnRfc2NhbGUgPSBzY2FsZTtcclxuICAgICAgXHJcbiAgICAvLyBkbyB3ZSBuZWVkIHRoaXM/XHJcbiAgICAvL2NhbGxIb3Zlck91dCgpO1xyXG5cclxuICAgIHRoaXMuem9vbS50cmFuc2xhdGUodHJhbnNsYXRlKS5zY2FsZShzY2FsZSkuZXZlbnQodGhpcy5fZWxlbWVudHMubWFwKTtcclxuXHJcbiAgICB0aGlzLmRpc3BhdGNoZXIudmlldy5jYWxsKHRoaXMsIHRyYW5zbGF0ZSwgc2NhbGUpO1xyXG4gICAgcmV0dXJuIHRoaXM7XHJcbn07XHJcblxyXG5tYXBtYXAucHJvdG90eXBlLmdldFZpZXcgPSBmdW5jdGlvbigpIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgdHJhbnNsYXRlOiB0aGlzLmN1cnJlbnRfdHJhbnNsYXRlLFxyXG4gICAgICAgIHNjYWxlOiB0aGlzLmN1cnJlbnRfc2NhbGVcclxuICAgIH1cclxufTtcclxuXHJcbm1hcG1hcC5wcm90b3R5cGUuem9vbVRvU2VsZWN0aW9uID0gZnVuY3Rpb24oc2VsZWN0aW9uLCBvcHRpb25zKSB7XHJcbiAgICBcclxuICAgIG9wdGlvbnMgPSBkZC5tZXJnZSh7XHJcbiAgICAgICAgZml0U2NhbGU6IDAuNyxcclxuICAgICAgICBhbmltYXRpb25EdXJhdGlvbjogNzUwLFxyXG4gICAgICAgIG1heFpvb206IDgsXHJcbiAgICAgICAgY2VudGVyOiBbY2VudGVyLngsIGNlbnRlci55XVxyXG4gICAgfSwgb3B0aW9ucyk7XHJcblxyXG4gICAgdmFyIHNlbCA9IHRoaXMuZ2V0UmVwcmVzZW50YXRpb25zKHNlbGVjdGlvbiksXHJcbiAgICAgICAgYm91bmRzID0gW1tJbmZpbml0eSxJbmZpbml0eV0sWy1JbmZpbml0eSwgLUluZmluaXR5XV0sXHJcbiAgICAgICAgcGF0aEdlbmVyYXRvciA9IGQzLmdlby5wYXRoKCkucHJvamVjdGlvbih0aGlzLl9wcm9qZWN0aW9uKTsgICAgXHJcbiAgICBcclxuICAgIHNlbC5lYWNoKGZ1bmN0aW9uKGVsKXtcclxuICAgICAgICB2YXIgYiA9IHBhdGhHZW5lcmF0b3IuYm91bmRzKGVsKTtcclxuICAgICAgICBib3VuZHNbMF1bMF0gPSBNYXRoLm1pbihib3VuZHNbMF1bMF0sIGJbMF1bMF0pO1xyXG4gICAgICAgIGJvdW5kc1swXVsxXSA9IE1hdGgubWluKGJvdW5kc1swXVsxXSwgYlswXVsxXSk7XHJcbiAgICAgICAgYm91bmRzWzFdWzBdID0gTWF0aC5tYXgoYm91bmRzWzFdWzBdLCBiWzFdWzBdKTtcclxuICAgICAgICBib3VuZHNbMV1bMV0gPSBNYXRoLm1heChib3VuZHNbMV1bMV0sIGJbMV1bMV0pO1xyXG4gICAgfSk7XHJcbiAgICBcclxuICAgIHZhciBkeCA9IGJvdW5kc1sxXVswXSAtIGJvdW5kc1swXVswXSxcclxuICAgICAgICBkeSA9IGJvdW5kc1sxXVsxXSAtIGJvdW5kc1swXVsxXSxcclxuICAgICAgICB4ID0gKGJvdW5kc1swXVswXSArIGJvdW5kc1sxXVswXSkgLyAyLFxyXG4gICAgICAgIHkgPSAoYm91bmRzWzBdWzFdICsgYm91bmRzWzFdWzFdKSAvIDIsXHJcbiAgICAgICAgc2l6ZSA9IHRoaXMuc2l6ZSgpLFxyXG4gICAgICAgIHNjYWxlID0gTWF0aC5taW4ob3B0aW9ucy5tYXhab29tLCBvcHRpb25zLmZpdFNjYWxlIC8gTWF0aC5tYXgoZHggLyBzaXplLndpZHRoLCBkeSAvIHNpemUuaGVpZ2h0KSksXHJcbiAgICAgICAgdHJhbnNsYXRlID0gW3NpemUud2lkdGggKiBvcHRpb25zLmNlbnRlclswXSAtIHNjYWxlICogeCwgc2l6ZS5oZWlnaHQgKiBvcHRpb25zLmNlbnRlclsxXSAtIHNjYWxlICogeV07XHJcbiAgICB0aGlzLmFuaW1hdGVWaWV3KHRyYW5zbGF0ZSwgc2NhbGUsIG9wdGlvbnMuY2FsbGJhY2ssIG9wdGlvbnMuYW5pbWF0aW9uRHVyYXRpb24pO1xyXG4gICAgcmV0dXJuIHRoaXM7XHJcbn07XHJcblxyXG5tYXBtYXAucHJvdG90eXBlLnpvb21Ub0JvdW5kcyA9IGZ1bmN0aW9uKGJvdW5kcywgY2FsbGJhY2ssIGR1cmF0aW9uKSB7XHJcbiAgICB2YXIgdyA9IGJvdW5kc1sxXVswXS1ib3VuZHNbMF1bMF0sXHJcbiAgICAgICAgaCA9IGJvdW5kc1sxXVsxXS1ib3VuZHNbMF1bMV0sXHJcbiAgICAgICAgY3ggPSAoYm91bmRzWzFdWzBdK2JvdW5kc1swXVswXSkgLyAyLFxyXG4gICAgICAgIGN5ID0gKGJvdW5kc1sxXVsxXStib3VuZHNbMF1bMV0pIC8gMixcclxuICAgICAgICBzaXplID0gdGhpcy5zaXplKCksXHJcbiAgICAgICAgc2NhbGUgPSBNYXRoLm1pbigyLCAwLjkgLyBNYXRoLm1heCh3IC8gc2l6ZS53aWR0aCwgaCAvIHNpemUuaGVpZ2h0KSksXHJcbiAgICAgICAgdHJhbnNsYXRlID0gW3NpemUud2lkdGggKiAwLjUgLSBzY2FsZSAqIGN4LCBzaXplLmhlaWdodCAqIDAuNSAtIHNjYWxlICogY3ldO1xyXG4gICAgXHJcbiAgICByZXR1cm4gdGhpcy5hbmltYXRlVmlldyh0cmFuc2xhdGUsIHNjYWxlLCBjYWxsYmFjaywgZHVyYXRpb24pO1xyXG59O1xyXG5cclxubWFwbWFwLnByb3RvdHlwZS56b29tVG9DZW50ZXIgPSBmdW5jdGlvbihjZW50ZXIsIHNjYWxlLCBjYWxsYmFjaywgZHVyYXRpb24pIHtcclxuXHJcbiAgICBzY2FsZSA9IHNjYWxlIHx8IDE7XHJcbiAgICBcclxuICAgIHZhciBzaXplID0gdGhpcy5zaXplKCksXHJcbiAgICAgICAgdHJhbnNsYXRlID0gW3NpemUud2lkdGggKiAwLjUgLSBzY2FsZSAqIGNlbnRlclswXSwgc2l6ZS5oZWlnaHQgKiAwLjUgLSBzY2FsZSAqIGNlbnRlclsxXV07XHJcblxyXG4gICAgcmV0dXJuIHRoaXMuYW5pbWF0ZVZpZXcodHJhbnNsYXRlLCBzY2FsZSwgY2FsbGJhY2ssIGR1cmF0aW9uKTtcclxufTtcclxuXHJcbm1hcG1hcC5wcm90b3R5cGUuem9vbVRvVmlld3BvcnRQb3NpdGlvbiA9IGZ1bmN0aW9uKGNlbnRlciwgc2NhbGUsIGNhbGxiYWNrLCBkdXJhdGlvbikge1xyXG5cclxuICAgIHZhciBwb2ludCA9IHRoaXMuX2VsZW1lbnRzLm1haW4ubm9kZSgpLmNyZWF0ZVNWR1BvaW50KCk7XHJcblxyXG4gICAgcG9pbnQueCA9IGNlbnRlclswXTtcclxuICAgIHBvaW50LnkgPSBjZW50ZXJbMV07XHJcblxyXG4gICAgdmFyIGN0bSA9IHRoaXMuX2VsZW1lbnRzLmdlb21ldHJ5Lm5vZGUoKS5nZXRTY3JlZW5DVE0oKS5pbnZlcnNlKCk7XHJcbiAgICBwb2ludCA9IHBvaW50Lm1hdHJpeFRyYW5zZm9ybShjdG0pO1xyXG5cclxuICAgIHBvaW50ID0gW3BvaW50LngsIHBvaW50LnldO1xyXG4gICAgXHJcbiAgICBzY2FsZSA9IHNjYWxlIHx8IDE7XHJcbiAgICBcclxuICAgIC8vdmFyIHBvaW50ID0gWyhjZW50ZXJbMF0tdGhpcy5jdXJyZW50X3RyYW5zbGF0ZVswXSkvdGhpcy5jdXJyZW50X3NjYWxlLCAoY2VudGVyWzFdLXRoaXMuY3VycmVudF90cmFuc2xhdGVbMV0pL3RoaXMuY3VycmVudF9zY2FsZV07XHJcbiAgICBcclxuICAgIHJldHVybiB0aGlzLnpvb21Ub0NlbnRlcihwb2ludCwgc2NhbGUsIGNhbGxiYWNrLCBkdXJhdGlvbik7XHJcbn07XHJcblxyXG5tYXBtYXAucHJvdG90eXBlLnJlc2V0Wm9vbSA9IGZ1bmN0aW9uKGNhbGxiYWNrLCBkdXJhdGlvbikge1xyXG4gICAgcmV0dXJuIHRoaXMuYW5pbWF0ZVZpZXcoWzAsMF0sMSwgY2FsbGJhY2ssIGR1cmF0aW9uKTtcclxuICAgIC8vIFRPRE8gdGFrZSBjZW50ZXIgaW50byBhY2NvdW50IHpvb21lZC1vdXQsIHdlIG1heSBub3QgYWx3YXlzIHdhbnQgdGhpcz9cclxuICAgIC8vZG9ab29tKFt3aWR0aCAqIChjZW50ZXIueC0wLjUpLGhlaWdodCAqIChjZW50ZXIueS0wLjUpXSwxKTtcclxufTtcclxuXHJcblxyXG4vLyBNYW5pcHVsYXRlIHJlcHJlc2VudGF0aW9uIGdlb21ldHJ5LiBUaGlzIGNhbiBiZSB1c2VkIGUuZy4gdG8gcmVnaXN0ZXIgZXZlbnQgaGFuZGxlcnMuXHJcbi8vIHNwZWMgaXMgYSBmdW5jdGlvbiB0byBiZSBjYWxsZWQgd2l0aCBzZWxlY3Rpb24gdG8gc2V0IHVwIGV2ZW50IGhhbmRsZXJcclxubWFwbWFwLnByb3RvdHlwZS5hcHBseUJlaGF2aW9yID0gZnVuY3Rpb24oc3BlYywgc2VsZWN0aW9uKSB7XHJcblxyXG4gICAgYXNzZXJ0KGRkLmlzRnVuY3Rpb24oc3BlYyksIFwiQmVoYXZpb3IgbXVzdCBiZSBhIGZ1bmN0aW9uXCIpO1xyXG4gICAgXHJcbiAgICB2YXIgbWFwID0gdGhpcztcclxuICAgIHRoaXMuX3Byb21pc2UuZ2VvbWV0cnkudGhlbihmdW5jdGlvbih0b3BvKSB7XHJcbiAgICAgICAgdmFyIHNlbCA9IG1hcC5nZXRSZXByZXNlbnRhdGlvbnMoc2VsZWN0aW9uKTtcclxuICAgICAgICAvLyBUT0RPOiB0aGlzIHNob3VsZCBiZSBjb25maWd1cmFibGUgdmlhIG9wdGlvbnNcclxuICAgICAgICAvLyBhbmQgbmVlZHMgdG8gaW50ZWdyYXRlIHdpdGggbWFuYWdpbmcgcG9pbnRlciBldmVudHMgKHNlZSBob3ZlckluZm8pXHJcbiAgICAgICAgc2VsLnN0eWxlKCdwb2ludGVyLWV2ZW50cycsJ3Zpc2libGVQYWludGVkJyk7XHJcbiAgICAgICAgc3BlYy5jYWxsKG1hcCwgc2VsKTtcclxuICAgIH0pO1xyXG4gICAgcmV0dXJuIHRoaXM7XHJcbn07XHJcblxyXG5cclxuLy8gYXBwbHkgYSBiZWhhdmlvciBvbiB0aGUgd2hvbGUgbWFwIHBhbmUgKGUuZy4gZHJhZy96b29tIGV0Yy4pXHJcbm1hcG1hcC5wcm90b3R5cGUuYXBwbHlNYXBCZWhhdmlvciA9IGZ1bmN0aW9uKHNwZWMpIHtcclxuICAgIHNwZWMuY2FsbCh0aGlzLCB0aGlzLl9lbGVtZW50cy5tYXApO1xyXG4gICAgcmV0dXJuIHRoaXM7XHJcbn07XHJcblxyXG5cclxuLy8gZGVwcmVjYXRlZCBtZXRob2RzIHVzaW5nIFVLLXNwZWxsaW5nXHJcbm1hcG1hcC5wcm90b3R5cGUuYXBwbHlCZWhhdmlvdXIgPSBmdW5jdGlvbihzcGVjLCBzZWxlY3Rpb24pIHtcclxuICAgIGNvbnNvbGUgJiYgY29uc29sZS5sb2cgJiYgY29uc29sZS5sb2coXCJEZXByZWNhdGlvbiB3YXJuaW5nOiBhcHBseUJlaGF2aW91cigpIGlzIGRlcHJlY2F0ZWQsIHVzZSBhcHBseUJlaGF2aW9yKCkgKFVTIHNwZWxsaW5nKSBpbnN0ZWFkIVwiKTtcclxuICAgIHJldHVybiB0aGlzLmFwcGx5QmVoYXZpb3Ioc3BlYywgc2VsZWN0aW9uKTtcclxufVxyXG5tYXBtYXAucHJvdG90eXBlLmFwcGx5TWFwQmVoYXZpb3VyID0gZnVuY3Rpb24oc3BlYywgc2VsZWN0aW9uKSB7XHJcbiAgICBjb25zb2xlICYmIGNvbnNvbGUubG9nICYmIGNvbnNvbGUubG9nKFwiRGVwcmVjYXRpb24gd2FybmluZzogYXBwbHlNYXBCZWhhdmlvdXIoKSBpcyBkZXByZWNhdGVkLCB1c2UgYXBwbHlNYXBCZWhhdmlvcigpIChVUyBzcGVsbGluZykgaW5zdGVhZCFcIik7XHJcbiAgICByZXR1cm4gdGhpcy5hcHBseU1hcEJlaGF2aW9yKHNwZWMsIHNlbGVjdGlvbik7XHJcbn1cclxuXHJcbi8vIGhhbmRsZXIgZm9yIGhpZ2gtbGV2ZWwgZXZlbnRzIG9uIHRoZSBtYXAgb2JqZWN0XHJcbm1hcG1hcC5wcm90b3R5cGUub24gPSBmdW5jdGlvbihldmVudE5hbWUsIGhhbmRsZXIpIHtcclxuICAgIHRoaXMuZGlzcGF0Y2hlci5vbihldmVudE5hbWUsIGhhbmRsZXIpO1xyXG4gICAgcmV0dXJuIHRoaXM7XHJcbn07XHJcblxyXG5mdW5jdGlvbiBkZWZhdWx0UmFuZ2VMYWJlbChsb3dlciwgdXBwZXIsIGZvcm1hdCwgZXhjbHVkZUxvd2VyLCBleGNsdWRlVXBwZXIpIHtcclxuICAgIHZhciBmID0gZm9ybWF0IHx8IGZ1bmN0aW9uKGxvd2VyKXtyZXR1cm4gbG93ZXJ9O1xyXG4gICAgICAgIFxyXG4gICAgaWYgKGlzTmFOKGxvd2VyKSkge1xyXG4gICAgICAgIGlmIChpc05hTih1cHBlcikpIHtcclxuICAgICAgICAgICAgY29uc29sZS53YXJuKFwicmFuZ2VMYWJlbDogbmVpdGhlciBsb3dlciBub3IgdXBwZXIgdmFsdWUgc3BlY2lmaWVkIVwiKTtcclxuICAgICAgICAgICAgcmV0dXJuIFwiXCI7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGVsc2Uge1xyXG4gICAgICAgICAgICByZXR1cm4gKGV4Y2x1ZGVVcHBlciA/IFwidW5kZXIgXCIgOiBcInVwIHRvIFwiKSArIGYodXBwZXIpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIGlmIChpc05hTih1cHBlcikpIHtcclxuICAgICAgICByZXR1cm4gZXhjbHVkZUxvd2VyID8gKFwibW9yZSB0aGFuIFwiICsgZihsb3dlcikpIDogKGYobG93ZXIpICsgXCIgYW5kIG1vcmVcIik7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gKGV4Y2x1ZGVMb3dlciA/ICc+ICcgOiAnJykgKyBmKGxvd2VyKSArIFwiIHRvIFwiICsgKGV4Y2x1ZGVVcHBlciA/ICc8JyA6ICcnKSArIGYodXBwZXIpO1xyXG59XHJcblxyXG52YXIgZDNfbG9jYWxlcyA9IHtcclxuICAgICdlbic6IHtcclxuICAgICAgICBkZWNpbWFsOiBcIi5cIixcclxuICAgICAgICB0aG91c2FuZHM6IFwiLFwiLFxyXG4gICAgICAgIGdyb3VwaW5nOiBbIDMgXSxcclxuICAgICAgICBjdXJyZW5jeTogWyBcIiRcIiwgXCJcIiBdLFxyXG4gICAgICAgIGRhdGVUaW1lOiBcIiVhICViICVlICVYICVZXCIsXHJcbiAgICAgICAgZGF0ZTogXCIlbS8lZC8lWVwiLFxyXG4gICAgICAgIHRpbWU6IFwiJUg6JU06JVNcIixcclxuICAgICAgICBwZXJpb2RzOiBbIFwiQU1cIiwgXCJQTVwiIF0sXHJcbiAgICAgICAgZGF5czogWyBcIlN1bmRheVwiLCBcIk1vbmRheVwiLCBcIlR1ZXNkYXlcIiwgXCJXZWRuZXNkYXlcIiwgXCJUaHVyc2RheVwiLCBcIkZyaWRheVwiLCBcIlNhdHVyZGF5XCIgXSxcclxuICAgICAgICBzaG9ydERheXM6IFsgXCJTdW5cIiwgXCJNb25cIiwgXCJUdWVcIiwgXCJXZWRcIiwgXCJUaHVcIiwgXCJGcmlcIiwgXCJTYXRcIiBdLFxyXG4gICAgICAgIG1vbnRoczogWyBcIkphbnVhcnlcIiwgXCJGZWJydWFyeVwiLCBcIk1hcmNoXCIsIFwiQXByaWxcIiwgXCJNYXlcIiwgXCJKdW5lXCIsIFwiSnVseVwiLCBcIkF1Z3VzdFwiLCBcIlNlcHRlbWJlclwiLCBcIk9jdG9iZXJcIiwgXCJOb3ZlbWJlclwiLCBcIkRlY2VtYmVyXCIgXSxcclxuICAgICAgICBzaG9ydE1vbnRoczogWyBcIkphblwiLCBcIkZlYlwiLCBcIk1hclwiLCBcIkFwclwiLCBcIk1heVwiLCBcIkp1blwiLCBcIkp1bFwiLCBcIkF1Z1wiLCBcIlNlcFwiLCBcIk9jdFwiLCBcIk5vdlwiLCBcIkRlY1wiIF0sXHJcbiAgICAgICAgcmFuZ2VMYWJlbDogZGVmYXVsdFJhbmdlTGFiZWwsXHJcbiAgICAgICAgdW5kZWZpbmVkTGFiZWw6IFwibm8gZGF0YVwiXHJcbiAgICB9LFxyXG4gICAgJ2RlJzoge1xyXG4gICAgICAgIGRlY2ltYWw6IFwiLFwiLFxyXG4gICAgICAgIHRob3VzYW5kczogXCIuXCIsXHJcbiAgICAgICAgZ3JvdXBpbmc6IFszXSxcclxuICAgICAgICBjdXJyZW5jeTogW1wi4oKsXCIsIFwiXCJdLFxyXG4gICAgICAgIGRhdGVUaW1lOiBcIiVhICViICVlICVYICVZXCIsXHJcbiAgICAgICAgZGF0ZTogXCIlZC4lbS4lWVwiLFxyXG4gICAgICAgIHRpbWU6IFwiJUg6JU06JVNcIixcclxuICAgICAgICBwZXJpb2RzOiBbXCJBTVwiLCBcIlBNXCJdLFxyXG4gICAgICAgIGRheXM6IFtcIlNvbm50YWdcIiwgXCJNb250YWdcIiwgXCJEaWVuc3RhZ1wiLCBcIk1pdHR3b2NoXCIsIFwiRG9ubmVyc3RhZ1wiLCBcIkZyZWl0YWdcIiwgXCJTYW1zdGFnXCJdLFxyXG4gICAgICAgIHNob3J0RGF5czogW1wiU29cIiwgXCJNb1wiLCBcIkRpXCIsIFwiTWlcIiwgXCJEb1wiLCBcIkZyXCIsIFwiU2FcIl0sXHJcbiAgICAgICAgbW9udGhzOiBbXCJKw6RubmVyXCIsIFwiRmVicnVhclwiLCBcIk3DpHJ6XCIsIFwiQXByaWxcIiwgXCJNYWlcIiwgXCJKdW5pXCIsIFwiSnVsaVwiLCBcIkF1Z3VzdFwiLCBcIlNlcHRlbWJlclwiLCBcIk9rdG9iZXJcIiwgXCJOb3ZlbWJlclwiLCBcIkRlemVtYmVyXCJdLFxyXG4gICAgICAgIHNob3J0TW9udGhzOiBbXCJKYW4uXCIsIFwiRmViLlwiLCBcIk3DpHJ6XCIsIFwiQXByLlwiLCBcIk1haVwiLCBcIkp1bmlcIiwgXCJKdWxpXCIsIFwiQXVnLlwiLCBcIlNlcC5cIiwgXCJPa3QuXCIsIFwiTm92LlwiLCBcIkRlei5cIl0sXHJcbiAgICAgICAgcmFuZ2VMYWJlbDogZnVuY3Rpb24obG93ZXIsIHVwcGVyLCBmb3JtYXQsIGV4Y2x1ZGVMb3dlciwgZXhjbHVkZVVwcGVyKSB7XHJcbiAgICAgICAgICAgIHZhciBmID0gZm9ybWF0IHx8IGZ1bmN0aW9uKGxvd2VyKXtyZXR1cm4gbG93ZXJ9O1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChpc05hTihsb3dlcikpIHtcclxuICAgICAgICAgICAgICAgIGlmIChpc05hTih1cHBlcikpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oXCJyYW5nZUxhYmVsOiBuZWl0aGVyIGxvd2VyIG5vciB1cHBlciB2YWx1ZSBzcGVjaWZpZWQhXCIpO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBcIlwiO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIChleGNsdWRlVXBwZXIgPyBcInVudGVyIFwiIDogXCJiaXMgXCIpICsgZih1cHBlcik7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgaWYgKGlzTmFOKHVwcGVyKSkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIChleGNsdWRlTG93ZXIgPyBcIm1laHIgYWxzIFwiICsgZihsb3dlcikgOiBmKGxvd2VyKSArIFwiIHVuZCBtZWhyXCIpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHJldHVybiAoZXhjbHVkZUxvd2VyID8gJz4gJyA6ICcnKSArIGYobG93ZXIpICsgXCIgYmlzIFwiICsgKGV4Y2x1ZGVVcHBlciA/ICc8JyA6ICcnKSArIGYodXBwZXIpO1xyXG4gICAgICAgIH0sXHJcbiAgICAgICAgdW5kZWZpbmVkTGFiZWw6IFwia2VpbmUgRGF0ZW5cIlxyXG4gICAgfVxyXG59O1xyXG5cclxuXHJcbm1hcG1hcC5wcm90b3R5cGUuc2V0TG9jYWxlID0gZnVuY3Rpb24obGFuZyl7XHJcbiAgICB2YXIgbG9jYWxlO1xyXG4gICAgaWYgKGRkLmlzU3RyaW5nKGxhbmcpICYmIGQzX2xvY2FsZXNbbGFuZ10pIHtcclxuICAgICAgICBsb2NhbGUgPSBkM19sb2NhbGVzW2xhbmddO1xyXG4gICAgfVxyXG4gICAgZWxzZSB7XHJcbiAgICAgICAgbG9jYWxlID0gbGFuZztcclxuICAgIH1cclxuICAgIHRoaXMubG9jYWxlID0gZDMubG9jYWxlKGxvY2FsZSk7XHJcbiAgICBcclxuICAgIC8vIEQzJ3MgbG9jYWxlIGRvZXNuJ3Qgc3VwcG9ydCBleHRlbmRlZCBhdHRyaWJ1dGVzLFxyXG4gICAgLy8gc28gY29weSB0aGVtIG92ZXIgbWFudWFsbHlcclxuICAgIHZhciBrZXlzID0gT2JqZWN0LmtleXMobG9jYWxlKTtcclxuICAgIGZvciAodmFyIGk9MDsgaTxrZXlzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgdmFyIGtleSA9IGtleXNbaV07XHJcbiAgICAgICAgaWYgKCF0aGlzLmxvY2FsZVtrZXldKSB7XHJcbiAgICAgICAgICAgIHRoaXMubG9jYWxlW2tleV0gPSBsb2NhbGVba2V5XTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHRoaXM7XHJcbn1cclxuXHJcbm1hcG1hcC5wcm90b3R5cGUub3B0aW9ucyA9IGZ1bmN0aW9uKHNwZWMsIHZhbHVlKSB7XHJcblxyXG4gICAgLy8gbG9jYWxlIGNhbiBiZSBzZXQgdGhyb3VnaCBvcHRpb25zIGJ1dCBuZWVkcyB0byBiZSBzZXQgdXAsIHNvIGtlZXAgdHJhY2sgb2YgdGhpcyBoZXJlXHJcbiAgICB2YXIgb2xkTG9jYWxlID0gdGhpcy5zZXR0aW5ncy5sb2NhbGU7XHJcblxyXG4gICAgbWFwbWFwLmV4dGVuZCh0aGlzLnNldHRpbmdzLCBzcGVjKTtcclxuICAgIFxyXG4gICAgaWYgKHRoaXMuc2V0dGluZ3MubG9jYWxlICE9IG9sZExvY2FsZSkge1xyXG4gICAgICAgIHRoaXMuc2V0TG9jYWxlKHRoaXMuc2V0dGluZ3MubG9jYWxlKTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gdGhpcztcclxufTtcclxuXHJcbm1hcG1hcC5wcm90b3R5cGUubGVnZW5kID0gZnVuY3Rpb24obGVnZW5kX2Z1bmMpIHtcclxuICAgIHRoaXMubGVnZW5kX2Z1bmMgPSBsZWdlbmRfZnVuYztcclxuICAgIHJldHVybiB0aGlzO1xyXG59XHJcbm1hcG1hcC5wcm90b3R5cGUudXBkYXRlTGVnZW5kID0gZnVuY3Rpb24oYXR0cmlidXRlLCByZXByQXR0cmlidXRlLCBtZXRhZGF0YSwgc2NhbGUsIHNlbGVjdGlvbikge1xyXG5cclxuICAgIGlmICghdGhpcy5sZWdlbmRfZnVuYyB8fCAhc2NhbGUpIHtcclxuICAgICAgICByZXR1cm4gdGhpcztcclxuICAgIH1cclxuICAgIFxyXG4gICAgaWYgKHR5cGVvZiBtZXRhZGF0YSA9PSAnc3RyaW5nJykge1xyXG4gICAgICAgIG1ldGFkYXRhID0gbWFwbWFwLmdldE1ldGFkYXRhKG1ldGFkYXRhKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgdmFyIHJhbmdlID0gc2NhbGUucmFuZ2UoKSxcclxuICAgICAgICBjbGFzc2VzLFxyXG4gICAgICAgIG1hcCA9IHRoaXM7IFxyXG5cclxuICAgIHZhciBoaXN0b2dyYW0gPSAoZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgdmFyIGRhdGEgPSBudWxsO1xyXG4gICAgICAgIHJldHVybiBmdW5jdGlvbih2YWx1ZSkge1xyXG4gICAgICAgICAgICAvLyBsYXp5IGluaXRpYWxpemF0aW9uIG9mIGhpc3RvZ3JhbVxyXG4gICAgICAgICAgICBpZiAoZGF0YSA9PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICBkYXRhID0ge307XHJcbiAgICAgICAgICAgICAgICB2YXIgcmVwcnMgPSBtYXAuZ2V0UmVwcmVzZW50YXRpb25zKHNlbGVjdGlvbilbMF07XHJcbiAgICAgICAgICAgICAgICByZXBycy5mb3JFYWNoKGZ1bmN0aW9uKHJlcHIpIHtcclxuICAgICAgICAgICAgICAgICAgICB2YXIgdmFsID0gcmVwci5fX2RhdGFfXy5wcm9wZXJ0aWVzW2F0dHJpYnV0ZV07XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gbWFrZSBhIHNlcGFyYXRlIGJpbiBmb3IgbnVsbC91bmRlZmluZWQgdmFsdWVzXHJcbiAgICAgICAgICAgICAgICAgICAgLy8gdmFsdWVzIGFyZSBhbHNvIGludmFsaWQgaWYgbnVtZXJpYyBzY2FsZSBhbmQgbm9uLW51bWVyaWMgdmFsdWVcclxuICAgICAgICAgICAgICAgICAgICBpZiAodmFsID09IG51bGwgfHwgKG1ldGFkYXRhLnNjYWxlICE9ICdvcmRpbmFsJyAmJiBpc05hTih2YWwpKSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB2YWwgPSBudWxsO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdmFsID0gc2NhbGUodmFsKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFkYXRhW3ZhbF0pIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZGF0YVt2YWxdID0gW3JlcHJdO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZGF0YVt2YWxdLnB1c2gocmVwcik7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgcmV0dXJuIGRhdGFbdmFsdWVdIHx8IFtdO1xyXG4gICAgICAgIH1cclxuICAgIH0pKCk7XHJcbiAgICBcclxuICAgIGZ1bmN0aW9uIGNvdW50ZXIocikge1xyXG4gICAgICAgIHJldHVybiBmdW5jdGlvbigpIHtcclxuICAgICAgICAgICAgcmV0dXJuIGhpc3RvZ3JhbShyKS5sZW5ndGg7XHJcbiAgICAgICAgfVxyXG4gICAgfSAgIFxyXG4gICAgXHJcbiAgICBmdW5jdGlvbiBvYmplY3RzKHIpIHtcclxuICAgICAgICByZXR1cm4gZnVuY3Rpb24oKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBoaXN0b2dyYW0ocik7XHJcbiAgICAgICAgfVxyXG4gICAgfSAgIFxyXG4gICAgXHJcbiAgICAvLyB0aGUgbWFpbiBkaXN0aW5jdGlvbiBpczpcclxuICAgIC8vIHdoZXRoZXIgd2UgaGF2ZSBhbiBvdXRwdXQgcmFuZ2UgZGl2aWRlZCBpbnRvIGNsYXNzZXMsIG9yIGEgY29udGludW91cyByYW5nZVxyXG4gICAgLy8gaW4gdGhlIGQzIEFQSSwgbnVtZXJpYyBzY2FsZXMgd2l0aCBhIGRpc2NyZXRlIHJhbmdlIGhhdmUgYW4gaW52ZXJ0RXh0ZW50IG1ldGhvZFxyXG4gICAgaWYgKHNjYWxlLmludmVydEV4dGVudCkge1xyXG4gICAgICAgIC8vY2xhc3NlcyA9IFtzY2FsZS5pbnZlcnRFeHRlbnQocmFuZ2VbMF0pWzBdXTtcclxuICAgICAgICBjbGFzc2VzID0gcmFuZ2UubWFwKGZ1bmN0aW9uKHIsIGkpIHtcclxuICAgICAgICAgICAgdmFyIGV4dGVudCA9IHNjYWxlLmludmVydEV4dGVudChyKTtcclxuICAgICAgICAgICAgLy8gaWYgd2UgaGF2ZSB0b28gbWFueSBpdGVtcyBpbiByYW5nZSwgYm90aCBlbnRyaWVzIGluIGV4dGVudCB3aWxsIGJlIHVuZGVmaW5lZCAtIGlnbm9yZVxyXG4gICAgICAgICAgICBpZiAoZXh0ZW50WzBdID09IG51bGwgJiYgZXh0ZW50WzFdID09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybihcInJhbmdlIGZvciBcIiArIG1ldGFkYXRhLmtleSArIFwiIGNvbnRhaW5zIHN1cGVyZmx1b3VzIHZhbHVlICdcIiArIHIgKyBcIicgLSBpZ25vcmluZyFcIik7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICAgICAgcmVwcmVzZW50YXRpb246IHIsXHJcbiAgICAgICAgICAgICAgICB2YWx1ZVJhbmdlOiBleHRlbnQsXHJcbiAgICAgICAgICAgICAgICBpbmNsdWRlTG93ZXI6IGZhbHNlLFxyXG4gICAgICAgICAgICAgICAgaW5jbHVkZVVwcGVyOiBpPHJhbmdlLmxlbmd0aC0xLFxyXG4gICAgICAgICAgICAgICAgLy8gbGF6eSBhY2Nlc3NvcnMgLSBwcm9jZXNzaW5nIGludGVuc2l2ZVxyXG4gICAgICAgICAgICAgICAgY291bnQ6IGNvdW50ZXIociksXHJcbiAgICAgICAgICAgICAgICBvYmplY3RzOiBvYmplY3RzKHIpXHJcbiAgICAgICAgICAgICAgICAvL1RPRE86IG90aGVyIC8gbW9yZSBnZW5lcmFsIGFnZ3JlZ2F0aW9ucz9cclxuICAgICAgICAgICAgfTtcclxuICAgICAgICB9KVxyXG4gICAgICAgIC5maWx0ZXIoZnVuY3Rpb24oZCl7cmV0dXJuIGQ7fSk7XHJcbiAgICB9XHJcbiAgICBlbHNlIHtcclxuICAgICAgICAvLyBvcmRpbmFsIGFuZCBjb250aW51b3VzLXJhbmdlIHNjYWxlc1xyXG4gICAgICAgIGNsYXNzZXMgPSByYW5nZS5tYXAoZnVuY3Rpb24ociwgaSkge1xyXG4gICAgICAgICAgICB2YXIgdmFsdWUgPSB1bmRlZmluZWQ7XHJcbiAgICAgICAgICAgIGlmIChzY2FsZS5pbnZlcnQpIHtcclxuICAgICAgICAgICAgICAgIHZhbHVlID0gc2NhbGUuaW52ZXJ0KHIpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHJldHVybih7XHJcbiAgICAgICAgICAgICAgICByZXByZXNlbnRhdGlvbjogcixcclxuICAgICAgICAgICAgICAgIHZhbHVlOiB2YWx1ZSxcclxuICAgICAgICAgICAgICAgIC8vIGxhenkgYWNjZXNzb3JzIC0gcHJvY2Vzc2luZyBpbnRlbnNpdmVcclxuICAgICAgICAgICAgICAgIGNvdW50OiBjb3VudGVyKHIpLCAgXHJcbiAgICAgICAgICAgICAgICBvYmplY3RzOiBvYmplY3RzKHIpXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICB2YXIgdW5kZWZpbmVkQ2xhc3MgPSBudWxsO1xyXG4gICAgLy8gVE9ETzogaGFjayB0byBnZXQgdW5kZWZpbmVkIGNvbG9yIGJveFxyXG4gICAgaWYgKHJlcHJBdHRyaWJ1dGUgPT0gJ2ZpbGwnICYmIG1ldGFkYXRhLnVuZGVmaW5lZENvbG9yICE9ICd0cmFuc3BhcmVudCcpIHtcclxuICAgICAgICB1bmRlZmluZWRDbGFzcyA9IHtcclxuICAgICAgICAgICAgcmVwcmVzZW50YXRpb246IG1ldGFkYXRhLnVuZGVmaW5lZENvbG9yLFxyXG4gICAgICAgICAgICAnY2xhc3MnOiAndW5kZWZpbmVkJyxcclxuICAgICAgICAgICAgY291bnQ6IGNvdW50ZXIobnVsbCksXHJcbiAgICAgICAgICAgIG9iamVjdHM6IG9iamVjdHMobnVsbClcclxuICAgICAgICB9O1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICB0aGlzLmxlZ2VuZF9mdW5jLmNhbGwodGhpcywgYXR0cmlidXRlLCByZXByQXR0cmlidXRlLCBtZXRhZGF0YSwgY2xhc3NlcywgdW5kZWZpbmVkQ2xhc3MpO1xyXG4gICAgICAgICAgICAgICAgICAgIFxyXG4gICAgcmV0dXJuIHRoaXM7XHJcblxyXG59O1xyXG5cclxuZnVuY3Rpb24gdmFsdWVPckNhbGwoc3BlYykge1xyXG4gICAgaWYgKHR5cGVvZiBzcGVjID09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICByZXR1cm4gc3BlYy5hcHBseSh0aGlzLCBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpKTtcclxuICAgIH1cclxuICAgIHJldHVybiBzcGVjO1xyXG59XHJcblxyXG4vLyBuYW1lc3BhY2UgZm9yIGxlZ2VuZCBnZW5lcmF0aW9uIGZ1bmN0aW9uc1xyXG5tYXBtYXAubGVnZW5kID0ge307XHJcblxyXG5tYXBtYXAubGVnZW5kLmh0bWwgPSBmdW5jdGlvbihvcHRpb25zKSB7XHJcblxyXG4gICAgdmFyIERFRkFVTFRTID0ge1xyXG4gICAgICAgIGxlZ2VuZENsYXNzTmFtZTogJ21hcExlZ2VuZCcsXHJcbiAgICAgICAgbGVnZW5kU3R5bGU6IHt9LFxyXG4gICAgICAgIGNlbGxTdHlsZToge30sXHJcbiAgICAgICAgY29sb3JCb3hTdHlsZToge1xyXG4gICAgICAgICAgICBvdmVyZmxvdzogJ2hpZGRlbicsXHJcbiAgICAgICAgICAgIGRpc3BsYXk6ICdpbmxpbmUtYmxvY2snLFxyXG4gICAgICAgICAgICB3aWR0aDogJzNlbScsXHJcbiAgICAgICAgICAgIGhlaWdodDogJzEuNWVtJyxcclxuICAgICAgICAgICAgJ3ZlcnRpY2FsLWFsaWduJzogJy0wLjVlbScsXHJcbiAgICAgICAgICAgIC8vYm9yZGVyOiAnMXB4IHNvbGlkICM0NDQ0NDQnLFxyXG4gICAgICAgICAgICBtYXJnaW46ICcwIDAuNWVtIDAuMmVtIDAnXHJcbiAgICAgICAgfSxcclxuICAgICAgICBjb2xvckZpbGxTdHlsZToge1xyXG4gICAgICAgICAgICB3aWR0aDogJzAnLFxyXG4gICAgICAgICAgICBoZWlnaHQ6ICcwJyxcclxuICAgICAgICAgICAgJ2JvcmRlci13aWR0aCc6ICcxMDBweCcsXHJcbiAgICAgICAgICAgICdib3JkZXItc3R5bGUnOiAnc29saWQnLFxyXG4gICAgICAgICAgICAnYm9yZGVyLWNvbG9yJzogJyNmZmZmZmYnXHJcbiAgICAgICAgfSxcclxuICAgICAgICBsYWJlbFN0eWxlOiB7fSxcclxuICAgICAgICBoaXN0b2dyYW1CYXJTdHlsZToge1xyXG4gICAgICAgICAgICAnZGlzcGxheSc6ICdpbmxpbmUtYmxvY2snLFxyXG4gICAgICAgICAgICBoZWlnaHQ6ICcxLjFlbScsXHJcbiAgICAgICAgICAgICdmb250LXNpemUnOiAnMC44ZW0nLFxyXG4gICAgICAgICAgICAndmVydGljYWwtYWxpZ24nOiAnMC4xZW0nLFxyXG4gICAgICAgICAgICBjb2xvcjogJyM5OTk5OTknLFxyXG4gICAgICAgICAgICAnYmFja2dyb3VuZC1jb2xvcic6ICcjZGRkZGRkJ1xyXG4gICAgICAgIH0sXHJcbiAgICAgICAgaGlzdG9ncmFtQmFyV2lkdGg6IDFcclxuICAgIH07XHJcbiAgICBcclxuICAgIG9wdGlvbnMgPSBtYXBtYXAuZXh0ZW5kKERFRkFVTFRTLCBvcHRpb25zKTtcclxuICAgIFxyXG4gICAgZnVuY3Rpb24gcGFyYW1ldGVyRnVuY3Rpb24ocGFyYW0sIGZ1bmMpIHtcclxuICAgICAgICBpZiAoZGQuaXNGdW5jdGlvbihwYXJhbSkpIHJldHVybiBwYXJhbTtcclxuICAgICAgICByZXR1cm4gZnVuYyhwYXJhbSk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIG9wdGlvbnMuaGlzdG9ncmFtQmFyV2lkdGggPSBwYXJhbWV0ZXJGdW5jdGlvbihvcHRpb25zLmhpc3RvZ3JhbUJhcldpZHRoLCBmdW5jdGlvbihwYXJhbSkge1xyXG4gICAgICAgIHJldHVybiBmdW5jdGlvbihjb3VudCkge1xyXG4gICAgICAgICAgICB2YXIgd2lkdGggPSBjb3VudCAqIHBhcmFtO1xyXG4gICAgICAgICAgICAvLyBhbHdheXMgcm91bmQgdXAgc21hbGwgdmFsdWVzIHRvIG1ha2Ugc3VyZSBhdCBsZWFzdCAxcHggd2lkZVxyXG4gICAgICAgICAgICBpZiAod2lkdGggPiAwICYmIHdpZHRoIDwgMSkgd2lkdGggPSAxO1xyXG4gICAgICAgICAgICByZXR1cm4gd2lkdGg7XHJcbiAgICAgICAgfTtcclxuICAgIH0pO1xyXG4gICAgXHJcbiAgICByZXR1cm4gZnVuY3Rpb24oYXR0cmlidXRlLCByZXByQXR0cmlidXRlLCBtZXRhZGF0YSwgY2xhc3NlcywgdW5kZWZpbmVkQ2xhc3MpIHtcclxuICAgIFxyXG4gICAgICAgIHZhciBsZWdlbmQgPSB0aGlzLl9lbGVtZW50cy5wYXJlbnQuc2VsZWN0KCcuJyArIG9wdGlvbnMubGVnZW5kQ2xhc3NOYW1lKTtcclxuICAgICAgICBpZiAobGVnZW5kLmVtcHR5KCkpIHtcclxuICAgICAgICAgICAgbGVnZW5kID0gdGhpcy5fZWxlbWVudHMucGFyZW50LmFwcGVuZCgnZGl2JylcclxuICAgICAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsb3B0aW9ucy5sZWdlbmRDbGFzc05hbWUpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICBsZWdlbmQuc3R5bGUob3B0aW9ucy5sZWdlbmRTdHlsZSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gVE9ETzogYXR0cmlidXRlIG1heSBiZSBhIGZ1bmN0aW9uLCBzbyB3ZSBjYW5ub3QgZWFzaWx5IGdlbmVyYXRlIGEgbGFiZWwgZm9yIGl0XHJcbiAgICAgICAgdmFyIHRpdGxlID0gbGVnZW5kLnNlbGVjdEFsbCgnaDMnKVxyXG4gICAgICAgICAgICAuZGF0YShbdmFsdWVPckNhbGwobWV0YWRhdGEubGFiZWwsIGF0dHJpYnV0ZSkgfHwgKGRkLmlzU3RyaW5nKGF0dHJpYnV0ZSkgPyBhdHRyaWJ1dGUgOiAnJyldKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgdGl0bGUuZW50ZXIoKS5hcHBlbmQoJ2gzJyk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgdGl0bGUuaHRtbChmdW5jdGlvbihkKXtyZXR1cm4gZDt9KTtcclxuICAgICAgICBcclxuICAgICAgICAvLyB3ZSBuZWVkIGhpZ2hlc3QgdmFsdWVzIGZpcnN0IGZvciBudW1lcmljIHNjYWxlc1xyXG4gICAgICAgIGlmIChtZXRhZGF0YS5zY2FsZSAhPSAnb3JkaW5hbCcpIHtcclxuICAgICAgICAgICAgY2xhc3Nlcy5yZXZlcnNlKCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmICh1bmRlZmluZWRDbGFzcykge1xyXG4gICAgICAgICAgICBjbGFzc2VzLnB1c2godW5kZWZpbmVkQ2xhc3MpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB2YXIgY2VsbHMgPSBsZWdlbmQuc2VsZWN0QWxsKCdkaXYubGVnZW5kQ2VsbCcpXHJcbiAgICAgICAgICAgIC5kYXRhKGNsYXNzZXMpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGNlbGxzLmV4aXQoKS5yZW1vdmUoKTtcclxuICAgICAgICBcclxuICAgICAgICB2YXIgbmV3Y2VsbHMgPSBjZWxscy5lbnRlcigpXHJcbiAgICAgICAgICAgIC5hcHBlbmQoJ2RpdicpXHJcbiAgICAgICAgICAgIC5zdHlsZShvcHRpb25zLmNlbGxTdHlsZSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgY2VsbHNcclxuICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2xlZ2VuZENlbGwnKVxyXG4gICAgICAgICAgICAuZWFjaChmdW5jdGlvbihkKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoZC5jbGFzcykge1xyXG4gICAgICAgICAgICAgICAgICAgIGQzLnNlbGVjdCh0aGlzKS5jbGFzc2VkKGQuY2xhc3MsIHRydWUpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICBcclxuICAgICAgICBmdW5jdGlvbiB1cGRhdGVSZXByZXNlbnRhdGlvbnMobmV3Y2VsbHMsIGNlbGxzLCBvcHRpb25zKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgICAgIG5ld2NlbGxzID0gbmV3Y2VsbHMuYXBwZW5kKCdzdmcnKVxyXG4gICAgICAgICAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2xlZ2VuZENvbG9yJylcclxuICAgICAgICAgICAgICAgIC5zdHlsZShvcHRpb25zLmNvbG9yQm94U3R5bGUpO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGlmIChyZXByQXR0cmlidXRlID09ICdmaWxsJykge1xyXG4gICAgICAgICAgICAgICAgbmV3Y2VsbHMuYXBwZW5kKCdyZWN0JylcclxuICAgICAgICAgICAgICAgICAgICAuYXR0cih7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHdpZHRoOiAxMDAsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGhlaWdodDogMTAwXHJcbiAgICAgICAgICAgICAgICAgICAgfSlcclxuICAgICAgICAgICAgICAgICAgICAuYXR0cih7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdmaWxsJzogZnVuY3Rpb24oZCkge3JldHVybiBkLnJlcHJlc2VudGF0aW9uO31cclxuICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGNlbGxzLnNlbGVjdCgnLmxlZ2VuZENvbG9yIHJlY3QnKVxyXG4gICAgICAgICAgICAgICAgICAgIC50cmFuc2l0aW9uKClcclxuICAgICAgICAgICAgICAgICAgICAuYXR0cih7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICdmaWxsJzogZnVuY3Rpb24oZCkge3JldHVybiBkLnJlcHJlc2VudGF0aW9uO31cclxuICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBlbHNlIGlmIChyZXByQXR0cmlidXRlID09ICdzdHJva2UnKSB7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgLy8gY29uc3RydWN0IGF0dHJpYnV0ZXMgb2JqZWN0IGZyb20gcmVwckF0dHJpYnV0ZSB2YXJpYWJsZVxyXG4gICAgICAgICAgICAgICAgdmFyIHN0cm9rZUF0dHJzID0ge307XHJcbiAgICAgICAgICAgICAgICBzdHJva2VBdHRyc1tyZXByQXR0cmlidXRlXSA9IGZ1bmN0aW9uKGQpIHtyZXR1cm4gZC5yZXByZXNlbnRhdGlvbjt9O1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBuZXdjZWxscy5hcHBlbmQoJ2xpbmUnKVxyXG4gICAgICAgICAgICAgICAgICAgIC5hdHRyKHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgeTE6IDEwLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB5MjogMTAsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHgxOiA1LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB4MjogMTAwLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBzdHJva2U6ICcjMDAwMDAwJyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ3N0cm9rZS13aWR0aCc6IDNcclxuICAgICAgICAgICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICAgICAgICAgIC5hdHRyKHN0cm9rZUF0dHJzKTtcclxuICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIGNlbGxzLnNlbGVjdCgnLmxlZ2VuZENvbG9yIHJlY3QnKVxyXG4gICAgICAgICAgICAgICAgICAgIC50cmFuc2l0aW9uKClcclxuICAgICAgICAgICAgICAgICAgICAuYXR0cihzdHJva2VBdHRycyk7XHJcblxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIHVwZGF0ZVJlcHJlc2VudGF0aW9ucyhuZXdjZWxscywgY2VsbHMsIG9wdGlvbnMpO1xyXG4gICAgICAgIFxyXG4gICAgICAgIG5ld2NlbGxzLmFwcGVuZCgnc3BhbicpXHJcbiAgICAgICAgICAgIC5hdHRyKCdjbGFzcycsJ2xlZ2VuZExhYmVsJylcclxuICAgICAgICAgICAgLnN0eWxlKG9wdGlvbnMubGFiZWxTdHlsZSk7XHJcblxyXG4gICAgICAgIGNlbGxzLmF0dHIoJ2RhdGEtY291bnQnLGZ1bmN0aW9uKGQpIHtyZXR1cm4gZC5jb3VudCgpO30pO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGNlbGxzLnNlbGVjdCgnLmxlZ2VuZExhYmVsJylcclxuICAgICAgICAgICAgLnRleHQoZnVuY3Rpb24oZCkge1xyXG4gICAgICAgICAgICAgICAgdmFyIGZvcm1hdHRlcjtcclxuICAgICAgICAgICAgICAgIC8vIFRPRE86IHdlIG5lZWQgc29tZSB3YXkgb2YgZmluZGluZyBvdXQgd2hldGhlciB3ZSBoYXZlIGludGVydmFscyBvciB2YWx1ZXMgZnJvbSB0aGUgbWV0YWRhdGFcclxuICAgICAgICAgICAgICAgIC8vIHRvIGNhY2hlIHRoZSBsYWJlbCBmb3JtYXR0ZXJcclxuICAgICAgICAgICAgICAgIGlmIChkLnZhbHVlUmFuZ2UpIHtcclxuICAgICAgICAgICAgICAgICAgICBmb3JtYXR0ZXIgPSBtZXRhZGF0YS5nZXRSYW5nZUZvcm1hdHRlcigpO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmb3JtYXR0ZXIoZC52YWx1ZVJhbmdlWzBdLCBkLnZhbHVlUmFuZ2VbMV0sIGQuaW5jbHVkZUxvd2VyLCBkLmluY2x1ZGVVcHBlcik7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBpZiAoZC52YWx1ZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGZvcm1hdHRlciA9IG1ldGFkYXRhLmdldEZvcm1hdHRlcigpO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmb3JtYXR0ZXIoZC52YWx1ZSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gbWV0YWRhdGEudW5kZWZpbmVkTGFiZWw7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICBpZiAob3B0aW9ucy5oaXN0b2dyYW0pIHtcclxuXHJcbiAgICAgICAgICAgIG5ld2NlbGxzLmFwcGVuZCgnc3BhbicpXHJcbiAgICAgICAgICAgICAgICAuYXR0cignY2xhc3MnLCAnbGVnZW5kSGlzdG9ncmFtQmFyJylcclxuICAgICAgICAgICAgICAgIC5zdHlsZShvcHRpb25zLmhpc3RvZ3JhbUJhclN0eWxlKTtcclxuXHJcbiAgICAgICAgICAgIGNlbGxzLnNlbGVjdCgnLmxlZ2VuZEhpc3RvZ3JhbUJhcicpLnRyYW5zaXRpb24oKVxyXG4gICAgICAgICAgICAgICAgLnN0eWxlKCd3aWR0aCcsIGZ1bmN0aW9uKGQpe1xyXG4gICAgICAgICAgICAgICAgICAgIHZhciB3aWR0aCA9IG9wdGlvbnMuaGlzdG9ncmFtQmFyV2lkdGgoZC5jb3VudCgpKTtcclxuICAgICAgICAgICAgICAgICAgICAvLyBzdHJpbmcgcmV0dXJuZWQ/IC0+IHVzZSB1bmNoYW5nZWRcclxuICAgICAgICAgICAgICAgICAgICBpZiAod2lkdGgubGVuZ3RoICYmIHdpZHRoLmluZGV4T2YoJ3B4JykgPT0gd2lkdGgubGVuZ2h0IC0gMikge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gd2lkdGg7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBNYXRoLnJvdW5kKHdpZHRoKSArICdweCc7XHJcbiAgICAgICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICAgICAgLnRleHQoZnVuY3Rpb24oZCkgeyByZXR1cm4gJyAnICsgZC5jb3VudCgpOyB9KTtcclxuICAgICAgICB9XHJcbiAgICAgICAgXHJcbiAgICAgICAgaWYgKG9wdGlvbnMuY2FsbGJhY2spIG9wdGlvbnMuY2FsbGJhY2soKTtcclxuICAgIH1cclxufVxyXG5cclxubWFwbWFwLmxlZ2VuZC5zdmcgPSBmdW5jdGlvbihyYW5nZSwgbGFiZWxGb3JtYXQsIGhpc3RvZ3JhbSwgb3B0aW9ucykge1xyXG5cclxuICAgIHZhciBERUZBVUxUUyA9IHtcclxuICAgICAgICBjZWxsU3BhY2luZzogNSxcclxuICAgICAgICBsYXlvdXQ6ICd2ZXJ0aWNhbCcsXHJcbiAgICAgICAgaGlzdG9ncmFtOiBmYWxzZSxcclxuICAgICAgICBoaXN0b2dyYW1MZW5ndGg6IDgwLFxyXG4gICAgICAgIGNvbnRhaW5lckF0dHJpYnV0ZXM6IHtcclxuICAgICAgICAgICAgdHJhbnNmb3JtOiAndHJhbnNsYXRlKDIwLDEwKSdcclxuICAgICAgICB9LFxyXG4gICAgICAgIGJhY2tncm91bmRBdHRyaWJ1dGVzOiB7XHJcbiAgICAgICAgICAgIGZpbGw6ICcjZmZmJyxcclxuICAgICAgICAgICAgJ2ZpbGwtb3BhY2l0eSc6IDAuOSxcclxuICAgICAgICAgICAgeDogLTEwLFxyXG4gICAgICAgICAgICB5OiAtMTAsXHJcbiAgICAgICAgICAgIHdpZHRoOiAyMjBcclxuICAgICAgICB9LFxyXG4gICAgICAgIGNlbGxBdHRyaWJ1dGVzOiB7XHJcbiAgICAgICAgfSxcclxuICAgICAgICBjb2xvckF0dHJpYnV0ZXM6IHtcclxuICAgICAgICAgICAgJ3dpZHRoJzogNDAsXHJcbiAgICAgICAgICAgICdoZWlnaHQnOiAxOCxcclxuICAgICAgICAgICAgJ3N0cm9rZSc6ICcjMDAwJyxcclxuICAgICAgICAgICAgJ3N0cm9rZS13aWR0aCc6ICcwLjVweCcsXHJcbiAgICAgICAgICAgICdmaWxsJzogJyNmZmYnICAvLyB0aGlzIHdpbGwgYmUgdXNlZCBiZWZvcmUgZmlyc3QgdHJhbnNpdGlvblxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgdGV4dEF0dHJpYnV0ZXM6IHtcclxuICAgICAgICAgICAgJ2ZvbnQtc2l6ZSc6IDEwLFxyXG4gICAgICAgICAgICAncG9pbnRlci1ldmVudHMnOiAnbm9uZScsXHJcbiAgICAgICAgICAgIGR5OiAxMlxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgaGlzdG9ncmFtQmFyQXR0cmlidXRlczoge1xyXG4gICAgICAgICAgICB3aWR0aDogMCxcclxuICAgICAgICAgICAgeDogMTQwLFxyXG4gICAgICAgICAgICB5OiA0LFxyXG4gICAgICAgICAgICBoZWlnaHQ6IDEwLFxyXG4gICAgICAgICAgICBmaWxsOiAnIzAwMCcsXHJcbiAgICAgICAgICAgICdmaWxsLW9wYWNpdHknOiAwLjJcclxuICAgICAgICB9XHJcbiAgICB9O1xyXG5cclxuICAgIC8vIFRPRE86IHdlIGNhbid0IGludGVncmF0ZSB0aGVzIGludG8gc2V0dGluZ3MgYmVjYXVzZSBpdCByZWZlcmVuY2VzIHNldHRpbmdzIGF0dHJpYnV0ZXNcclxuICAgIHZhciBsYXlvdXRzID0ge1xyXG4gICAgICAgICdob3Jpem9udGFsJzoge1xyXG4gICAgICAgICAgICBjZWxsQXR0cmlidXRlczoge1xyXG4gICAgICAgICAgICAgICAgdHJhbnNmb3JtOiBmdW5jdGlvbihkLGkpeyByZXR1cm4gJ3RyYW5zbGF0ZSgnICsgaSAqIChvcHRpb25zLmNvbG9yQXR0cmlidXRlcy53aWR0aCArIG9wdGlvbnMuY2VsbFNwYWNpbmcpICsgJywwKSc7fVxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICB0ZXh0QXR0cmlidXRlczoge1xyXG4gICAgICAgICAgICAgICAgeTogZnVuY3Rpb24oKSB7IHJldHVybiBvcHRpb25zLmNvbG9yQXR0cmlidXRlcy5oZWlnaHQgKyBvcHRpb25zLmNlbGxTcGFjaW5nO31cclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSxcclxuICAgICAgICAndmVydGljYWwnOiB7XHJcbiAgICAgICAgICAgIGNlbGxBdHRyaWJ1dGVzOiB7XHJcbiAgICAgICAgICAgICAgICB0cmFuc2Zvcm06IGZ1bmN0aW9uKGQsaSl7IHJldHVybiAndHJhbnNsYXRlKDAsJyArIGkgKiAob3B0aW9ucy5jb2xvckF0dHJpYnV0ZXMuaGVpZ2h0ICsgb3B0aW9ucy5jZWxsU3BhY2luZykgKyAnKSc7fVxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICB0ZXh0QXR0cmlidXRlczoge1xyXG4gICAgICAgICAgICAgICAgeDogZnVuY3Rpb24oKSB7IHJldHVybiBvcHRpb25zLmNvbG9yQXR0cmlidXRlcy53aWR0aCArIG9wdGlvbnMuY2VsbFNwYWNpbmc7fSxcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH07XHJcblxyXG4gICAgdmFyIGxheW91dCA9IGxheW91dHNbb3B0aW9ucy5sYXlvdXRdO1xyXG4gICAgXHJcbiAgICBpZiAob3B0aW9ucy5sYXlvdXQgPT0gJ3ZlcnRpY2FsJykge1xyXG4gICAgICAgIHJhbmdlLnJldmVyc2UoKTtcclxuICAgIH1cclxuICAgIFxyXG4gICAgdGhpcy5fZWxlbWVudHMubGVnZW5kLmF0dHIob3B0aW9ucy5jb250YWluZXJBdHRyaWJ1dGVzKTtcclxuIFxyXG4gICAgdmFyIGJnID0gdGhpcy5fZWxlbWVudHMubGVnZW5kLnNlbGVjdEFsbCgncmVjdC5iYWNrZ3JvdW5kJylcclxuICAgICAgICAuZGF0YShbMV0pO1xyXG4gICAgXHJcbiAgICBiZy5lbnRlcigpXHJcbiAgICAgICAgLmFwcGVuZCgncmVjdCcpXHJcbiAgICAgICAgLmF0dHIoJ2NsYXNzJywgJ2JhY2tncm91bmQnKVxyXG4gICAgICAgIC5hdHRyKG9wdGlvbnMuYmFja2dyb3VuZEF0dHJpYnV0ZXMpO1xyXG4gICAgYmcudHJhbnNpdGlvbigpLmF0dHIoJ2hlaWdodCcsIGhpc3RvZ3JhbS5sZW5ndGggKiAob3B0aW9ucy5jb2xvckF0dHJpYnV0ZXMuaGVpZ2h0ICsgb3B0aW9ucy5jZWxsU3BhY2luZykgKyAoMjAgLSBvcHRpb25zLmNlbGxTcGFjaW5nKSk7ICAgIFxyXG4gICAgICAgIFxyXG4gICAgdmFyIGNlbGxzID0gdGhpcy5fZWxlbWVudHMubGVnZW5kLnNlbGVjdEFsbCgnZy5jZWxsJylcclxuICAgICAgICAuZGF0YShyYW5nZSk7XHJcbiAgICBcclxuICAgIGNlbGxzLmV4aXQoKS5yZW1vdmUoKTtcclxuICAgIFxyXG4gICAgdmFyIG5ld2NlbGxzID0gY2VsbHMuZW50ZXIoKVxyXG4gICAgICAgIC5hcHBlbmQoJ2cnKVxyXG4gICAgICAgIC5hdHRyKCdjbGFzcycsICdjZWxsJylcclxuICAgICAgICAuYXR0cihvcHRpb25zLmNlbGxBdHRyaWJ1dGVzKVxyXG4gICAgICAgIC5hdHRyKGxheW91dC5jZWxsQXR0cmlidXRlcyk7XHJcbiAgICAgICAgXHJcbiAgICBuZXdjZWxscy5hcHBlbmQoJ3JlY3QnKVxyXG4gICAgICAgIC5hdHRyKCdjbGFzcycsICdjb2xvcicpXHJcbiAgICAgICAgLmF0dHIob3B0aW9ucy5jb2xvckF0dHJpYnV0ZXMpXHJcbiAgICAgICAgLmF0dHIobGF5b3V0LmNvbG9yQXR0cmlidXRlcyk7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgIGlmIChvcHRpb25zLmhpc3RvZ3JhbSkge1xyXG5cclxuICAgICAgICBuZXdjZWxscy5hcHBlbmQoJ3JlY3QnKVxyXG4gICAgICAgICAgICAuYXR0cihcImNsYXNzXCIsIFwiYmFyXCIpXHJcbiAgICAgICAgICAgIC5hdHRyKG9wdGlvbnMuaGlzdG9ncmFtQmFyQXR0cmlidXRlcyk7XHJcblxyXG4gICAgICAgIGNlbGxzLnNlbGVjdCgnLmJhcicpLnRyYW5zaXRpb24oKVxyXG4gICAgICAgICAgICAuYXR0cihcIndpZHRoXCIsIGZ1bmN0aW9uKGQsaSl7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gaGlzdG9ncmFtW2hpc3RvZ3JhbS5sZW5ndGgtaS0xXS55ICogb3B0aW9ucy5oaXN0b2dyYW1MZW5ndGg7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIG5ld2NlbGxzLmFwcGVuZCgndGV4dCcpXHJcbiAgICAgICAgLmF0dHIob3B0aW9ucy50ZXh0QXR0cmlidXRlcylcclxuICAgICAgICAuYXR0cihsYXlvdXQudGV4dEF0dHJpYnV0ZXMpO1xyXG4gICAgXHJcbiAgICBjZWxscy5zZWxlY3QoJy5jb2xvcicpLnRyYW5zaXRpb24oKVxyXG4gICAgICAgIC5hdHRyKCdmaWxsJywgZnVuY3Rpb24oZCkge3JldHVybiBkO30pO1xyXG4gICAgXHJcbiAgICBjZWxscy5zZWxlY3QoJ3RleHQnKVxyXG4gICAgICAgIC50ZXh0KGxhYmVsRm9ybWF0KTtcclxufVxyXG5cclxubWFwbWFwLnByb3RvdHlwZS5wcm9qZWN0aW9uID0gZnVuY3Rpb24ocHJvamVjdGlvbikge1xyXG4gICAgaWYgKHByb2plY3Rpb24gPT09IHVuZGVmaW5lZCkgcmV0dXJuIHRoaXMuX3Byb2plY3Rpb247XHJcbiAgICB0aGlzLl9wcm9qZWN0aW9uID0gcHJvamVjdGlvbjtcclxuICAgIHJldHVybiB0aGlzO1xyXG59XHJcblxyXG5tYXBtYXAucHJvdG90eXBlLmV4dGVudCA9IGZ1bmN0aW9uKHNlbGVjdGlvbiwgb3B0aW9ucykge1xyXG5cclxuICAgIHZhciBtYXAgPSB0aGlzO1xyXG4gICAgXHJcbiAgICB0aGlzLnNlbGVjdGVkX2V4dGVudCA9IHNlbGVjdGlvbiB8fCB0aGlzLnNlbGVjdGVkO1xyXG4gICAgXHJcbiAgICB0aGlzLl9wcm9taXNlLmdlb21ldHJ5LnRoZW4oZnVuY3Rpb24odG9wbykge1xyXG4gICAgICAgIC8vIFRPRE86IGdldFJlcHJlc2VudGF0aW9ucygpIGRlcGVuZHMgb24gPHBhdGg+cyBiZWluZyBkcmF3biwgYnV0IHdlIHdhbnQgdG8gXHJcbiAgICAgICAgLy8gYmUgYWJsZSB0byBjYWxsIGV4dGVudCgpIGJlZm9yZSBkcmF3KCkgdG8gc2V0IHVwIHByb2plY3Rpb25cclxuICAgICAgICAvLyBzb2x1dGlvbjogbWFuYWdlIG1lcmdlZCBnZW9tZXRyeSArIGRhdGEgaW5kZXBlbmRlbnQgZnJvbSBTVkcgcmVwcmVzZW50YXRpb25cclxuICAgICAgICB2YXIgZ2VvbSA9IG1hcC5nZXRSZXByZXNlbnRhdGlvbnMobWFwLnNlbGVjdGVkX2V4dGVudCk7XHJcbiAgICAgICAgdmFyIGFsbCA9IHtcclxuICAgICAgICAgICAgJ3R5cGUnOiAnRmVhdHVyZUNvbGxlY3Rpb24nLFxyXG4gICAgICAgICAgICAnZmVhdHVyZXMnOiBbXVxyXG4gICAgICAgIH07XHJcbiAgICAgICAgZ2VvbS5lYWNoKGZ1bmN0aW9uKGQpe1xyXG4gICAgICAgICAgICBhbGwuZmVhdHVyZXMucHVzaChkKTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgbWFwLl9leHRlbnQoYWxsLCBvcHRpb25zKTtcclxuICAgIH0pO1xyXG4gICAgcmV0dXJuIHRoaXM7XHJcbn07XHJcblxyXG5tYXBtYXAucHJvdG90eXBlLl9leHRlbnQgPSBmdW5jdGlvbihnZW9tLCBvcHRpb25zKSB7XHJcblxyXG4gICAgb3B0aW9ucyA9IGRkLm1lcmdlKHtcclxuICAgICAgICBmaWxsRmFjdG9yOiAwLjlcclxuICAgIH0sIG9wdGlvbnMpO1xyXG4gICAgXHJcbiAgICAvLyBjb252ZXJ0L21lcmdlIHRvcG9KU09OXHJcbiAgICBpZiAoZ2VvbS50eXBlICYmIGdlb20udHlwZSA9PSAnVG9wb2xvZ3knKSB7XHJcbiAgICAgICAgLy8gd2UgbmVlZCB0byBtZXJnZSBhbGwgbmFtZWQgZmVhdHVyZXNcclxuICAgICAgICB2YXIgbmFtZXMgPSBPYmplY3Qua2V5cyhnZW9tLm9iamVjdHMpO1xyXG4gICAgICAgIHZhciBhbGwgPSBbXTtcclxuICAgICAgICBmb3IgKHZhciBpPTA7IGk8bmFtZXMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgYWxsID0gYWxsLmNvbmNhdCh0b3BvanNvbi5mZWF0dXJlKGdlb20sIGdlb20ub2JqZWN0c1tuYW1lc1tpXV0pLmZlYXR1cmVzKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgZ2VvbSA9IGFsbDtcclxuICAgIH1cclxuICAgIGlmIChkZC5pc0FycmF5KGdlb20pKSB7XHJcbiAgICAgICAgdmFyIGFsbCA9IHtcclxuICAgICAgICAgICAgJ3R5cGUnOiAnRmVhdHVyZUNvbGxlY3Rpb24nLFxyXG4gICAgICAgICAgICAnZmVhdHVyZXMnOiBnZW9tXHJcbiAgICAgICAgfTtcclxuICAgICAgICBnZW9tID0gYWxsO1xyXG4gICAgfVxyXG4gICAgXHJcbiAgICAvLyByZXNldCBzY2FsZSB0byBiZSBhYmxlIHRvIGNhbGN1bGF0ZSBleHRlbnRzIG9mIGdlb21ldHJ5XHJcbiAgICB0aGlzLl9wcm9qZWN0aW9uLnNjYWxlKDEpLnRyYW5zbGF0ZShbMCwgMF0pO1xyXG4gICAgdmFyIHBhdGhHZW5lcmF0b3IgPSBkMy5nZW8ucGF0aCgpLnByb2plY3Rpb24odGhpcy5fcHJvamVjdGlvbik7XHJcbiAgICB2YXIgYm91bmRzID0gcGF0aEdlbmVyYXRvci5ib3VuZHMoZ2VvbSk7XHJcbiAgICAvLyB1c2UgYWJzb2x1dGUgdmFsdWVzLCBhcyBlYXN0IGRvZXMgbm90IGFsd2F5cyBoYXZlIHRvIGJlIHJpZ2h0IG9mIHdlc3QhXHJcbiAgICBib3VuZHMuaGVpZ2h0ID0gTWF0aC5hYnMoYm91bmRzWzFdWzFdIC0gYm91bmRzWzBdWzFdKTtcclxuICAgIGJvdW5kcy53aWR0aCA9IE1hdGguYWJzKGJvdW5kc1sxXVswXSAtIGJvdW5kc1swXVswXSk7XHJcbiAgICBcclxuICAgIC8vIGlmIHdlIGFyZSBub3QgY2VudGVyZWQgaW4gbWlkcG9pbnQsIGNhbGN1bGF0ZSBcInBhZGRpbmcgZmFjdG9yXCJcclxuICAgIHZhciBmYWNfeCA9IDEgLSBNYXRoLmFicygwLjUgLSBjZW50ZXIueCkgKiAyLFxyXG4gICAgICAgIGZhY195ID0gMSAtIE1hdGguYWJzKDAuNSAtIGNlbnRlci55KSAqIDI7XHJcbiAgICAgICAgXHJcbiAgICB2YXIgc2l6ZSA9IHRoaXMuc2l6ZSgpO1xyXG4gICAgdmFyIHNjYWxlID0gb3B0aW9ucy5maWxsRmFjdG9yIC8gTWF0aC5tYXgoYm91bmRzLndpZHRoIC8gc2l6ZS53aWR0aCAvIGZhY194LCBib3VuZHMuaGVpZ2h0IC8gc2l6ZS5oZWlnaHQgLyBmYWNfeSk7XHJcbiAgICBcclxuICAgIHRoaXMuX3Byb2plY3Rpb25cclxuICAgICAgICAuc2NhbGUoc2NhbGUpXHJcbiAgICAgICAgLnRyYW5zbGF0ZShbKHNpemUud2lkdGggLSBzY2FsZSAqIChib3VuZHNbMV1bMF0gKyBib3VuZHNbMF1bMF0pKS8gMiwgKHNpemUuaGVpZ2h0IC0gc2NhbGUgKiAoYm91bmRzWzFdWzFdICsgYm91bmRzWzBdWzFdKSkvIDJdKTsgIFxyXG4gICAgXHJcbiAgICAvLyBhcHBseSBuZXcgcHJvamVjdGlvbiB0byBleGlzdGluZyBwYXRoc1xyXG4gICAgdGhpcy5fZWxlbWVudHMubWFwLnNlbGVjdEFsbChcInBhdGhcIilcclxuICAgICAgICAuYXR0cihcImRcIiwgcGF0aEdlbmVyYXRvcik7ICAgICAgICBcclxuICAgIFxyXG59O1xyXG5cclxuZnVuY3Rpb24ga2V5T3JDYWxsYmFjayh2YWwpIHtcclxuICAgIGlmICh0eXBlb2YgdmFsICE9ICdmdW5jdGlvbicpIHtcclxuICAgICAgICByZXR1cm4gZnVuY3Rpb24oZCl7XHJcbiAgICAgICAgICAgIHJldHVybiBkW3ZhbF07XHJcbiAgICAgICAgfTtcclxuICAgIH1cclxuICAgIHJldHVybiB2YWw7XHJcbn1cclxuXHJcbm1vZHVsZS5leHBvcnRzID0gbWFwbWFwOyJdfQ==
