require('./style.css');
require('./libs/leaflet/leaflet.js');
require('./libs/leaflet/leaflet.css');

var sprintf = require('sprintf');

var watersheds = {};

watersheds.launch = function(options) {
    var defaults = {
        // // center of conus, zoomed out to see almost all of it:
        // map_center: [39.0,-99.0],
        // map_zoom:   5
        // NC:
        map_center: [35.0,-82.0],
        map_zoom:   7
    };
    options = $.extend({}, defaults, options);

    var div = options.div;
    if (div instanceof jQuery) {
        div = div[0];
    }

    var mbUrl = "https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}@2x.png?access_token=" + options.mapbox_token;

    var streets     = L.tileLayer(mbUrl, {id: 'mapbox.streets'}),
        satellite   = L.tileLayer(mbUrl, {id: 'mapbox.streets-satellite'}),
        hydro       = L.tileLayer("http://basemap.nationalmap.gov/arcgis/rest/services/USGSHydroNHD/MapServer/tile/{z}/{y}/{x}");

    var baseLayers = {
        "Streets": streets,
        "Satellite": satellite,
        "Hydrology": hydro
    };

    var map = L.map(div, {
        attributionControl: false,
        maxZoom: 14,
        minZoom: 2,
        layers: [streets],
        zoomControl: false
    });
    L.control.attribution({position: 'topright', prefix: ''}).addTo(map);
    L.control.zoom({ position: 'topright' }).addTo(map);
    L.control.layers(baseLayers, {}, {position: 'topright'}).addTo(map);

    map.setView(options.map_center, options.map_zoom);

    window.getextent = function() {
        var b = map.getBounds();
        var lat = (b.getNorth() + b.getSouth())/2;
        var lon = (b.getEast() + b.getWest())/2;
        console.log(JSON.stringify({map: { center: [lat,lon], zoom: map.getZoom() }}));
    };
};

window.watersheds = watersheds;
