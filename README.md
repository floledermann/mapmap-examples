# mapmap-examples

***Collection of examples for the [mapmap.js API](https://github.com/floledermann/mapmap.js)***

## Running the examples

There is a minimal Python web server included that can be used to launch the examples. Run `serve.bat` on windows or 

```
python -m SimpleHTTPServer 8089
```

on your platform and point your browser to [`http://localhost:8089`](http://localhost:8089)

## Developing mapmap

If you want to use this repository as a base to test out changes for mapmap.js, the best setup is to link your local checkout of the mapmap.js repository as a npm package using [`npm link`](https://docs.npmjs.com/cli/link).

To do this, in the directory of your mapmap.js repository, run

```
npm link
```

Then, in the directory of this repository (mapmap-examples), run this sequence of commands:

```
npm link mapmap
npm install
```

You can then edit the mapmap.js source code in the original repository and have the changes reflected here. To automatically trigger a rebuild of mapmap.js with every change, run

```
npm run watch
```

and keep it running as long as you develop.

## Included examples

Folder     | Description
-----------|-------------
choropleth | A simple zoomable choropleth map
data       | Common data files used in the examples
minard     | A simplified version of [Minard's Map](http://datavizblog.com/2013/05/26/dataviz-history-charles-minards-flow-map-of-napoleons-russian-campaign-of-1812-part-5/) using mapmap.js
test       | A collection of small test examples

Other folders:

Folder     | Description
-----------|-------------
data       | Common data files used in the examples
lib        | 3rd party JavaScript libraries used in the examples

## More information 

For more information on mapmap.js, see the mapmap.js
[Programming Guide](https://github.com/floledermann/mapmap.js/wiki/Programming-Guide),
[API Documentation](https://github.com/floledermann/mapmap.js/wiki/API-Documentation)
or other pages in the [mapmap wiki](https://github.com/floledermann/mapmap.js/wiki).

If you have questions or suggestions for improvements, contact me on [Twitter](http://twitter.com/floledermann) or by [Email](mailto:florian.ledermann@tuwien.ac.at).