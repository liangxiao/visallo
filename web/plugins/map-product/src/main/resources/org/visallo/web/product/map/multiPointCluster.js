/**
 * This file is a fork of http://openlayers.org/en/master/apidoc/ol.source.Cluster.html
 * with support for multi-point clusters.
 */
define(['openlayers'], function(ol) {
    'use strict';

    var MultiPointCluster = function(options) {
        ol.source.Vector.call(this, {
            attributions: options.attributions,
            extent: options.extent,
            logo: options.logo,
            projection: options.projection,
            wrapX: options.wrapX
        });

        this.resolution = undefined;
        this.distance = options.distance !== undefined ? options.distance : 20;
        this.features = [];
        this.geometryFunction = options.geometryFunction || (feature => feature.getGeometry());
        this.source = options.source;
        this.refresh = _.debounce(this.refresh.bind(this), 100);
        this.source.on('change', this.refresh);
    };

    ol.inherits(MultiPointCluster, ol.source.Vector);

    MultiPointCluster.prototype.refresh = function() {
        this.clear();
        this.cluster();
        this.addFeatures(this.features);
        this.changed();
    }

    MultiPointCluster.prototype.getSource = function() {
        return this.source;
    }

    MultiPointCluster.prototype.loadFeatures = function(extent, resolution, projection) {
        this.source.loadFeatures(extent, resolution, projection);
        this.updateResolution(resolution);
    }

    MultiPointCluster.prototype.updateResolution = function(resolution) {
        if (resolution !== this.resolution) {
            this.clear();
            this.resolution = resolution;
            this.cluster();
            this.addFeatures(this.features);
        }
    }

    MultiPointCluster.prototype.setDistance = function(distance) {
        this.distance = distance;
        this.refresh();
    }

    MultiPointCluster.prototype.cluster = function() {
        var self = this;
        if (this.resolution === undefined) {
            return;
        }
        const resolution = this.resolution;
        const distance = this.distance;
        this.features.length = 0;
        var source = this.source;
        var features = source.getFeatures();
        var clustered = {};

        const getRadius = feature => {
            const radius = feature.get('_nodeRadius');
            return radius || distance;
        }
        const maxRadius = features.reduce((max, f) => {
            const radius = getRadius(f);
            return Math.max(max, radius)
        }, 0);

        for (let i = 0; i < features.length; i++) {
            clusterFeature(features[i]);
        }

        function clusterFeature(feature) {
            const radius = getRadius(feature);
            var mapDistanceSearch = (radius + maxRadius) * resolution;
            var mapDistance = radius * resolution;
            var geometry = self.geometryFunction(feature);
            if (geometry) {
                var coordinates = geometry.getCoordinates();
                for (let i = 0; i < coordinates.length; i++) {
                    clusterCoordinate(coordinates[i], i);
                }
            }

            function clusterCoordinate(coordinate, coordinateIndex) {
                if (!((feature.getId().toString() + '_' + coordinateIndex) in clustered)) {

                    // Search radius is this feature box + max size
                    const extentSearch = ol.extent.boundingExtent([coordinate])
                    ol.extent.buffer(extentSearch, mapDistanceSearch, extentSearch);

                    // Exact bounds to further match for collision
                    const extent1 = ol.extent.boundingExtent([coordinate])
                    ol.extent.buffer(extent1, mapDistance, extent1);

                    var neighbors = source.getFeaturesInExtent(extentSearch),
                        coords = [],
                        count = 0;

                    const featuresToCluster = neighbors.filter(function(neighbor) {
                        var neighborGeometry = self.geometryFunction(neighbor);
                        var neighborCoordinates = neighborGeometry.getCoordinates();
                        var neighborUid = neighbor.getId().toString() + '_';

                        var coordsInCluster = neighborCoordinates.filter(function(coordinate, coordinateIndex) {
                            var uid = neighborUid + coordinateIndex;

                            const extent2 = ol.extent.boundingExtent([coordinate])
                            ol.extent.buffer(extent2, getRadius(neighbor) * resolution, extent2);

                            if (ol.extent.intersects(extent1, extent2)) {
                                if (!(uid in clustered)) {
                                    coords.push(coordinate)
                                    clustered[uid] = true;
                                    return true;
                                }
                            }
                            return false;
                        }).length
                        count += coordsInCluster;
                        return coordsInCluster > 0;
                    });
                    self.features.push(self.createCluster(featuresToCluster, coords, count));
                }
            }
        }
    };

    MultiPointCluster.prototype.createCluster = function(features, coords, count) {
        var centers = coords.reduce((sums, c) => {
                return sums.map((s, i) => s + c[i])
            }, [0, 0]),
            average = centers.map(val => val / coords.length),
            cluster = new ol.Feature(new ol.geom.Point(average));
        cluster.set('features', features);
        cluster.set('coordinates', coords);
        cluster.set('count', count);
        return cluster;
    };

    return MultiPointCluster;
});
