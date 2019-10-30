///////////////////////////////////////////////////////////////////////////
// Copyright 2017 Esri
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
///////////////////////////////////////////////////////////////////////////
define([
    "dojo/_base/array",
    "dojo/_base/declare",
    "dojo/_base/lang",
    "dojo/Deferred",
    "dojo/DeferredList",
    "dojo/dom-attr",
    "dojo/dom-construct",
    "dojo/dom-style",
    "dojo/string",
    "dijit/form/CheckBox",
    "dijit/form/Select",
    "jimu/LayerStructure",
    "jimu/SelectionManager",
    'jimu/CSVUtils',
    "esri/Color",
    "esri/graphicsUtils",
    "esri/layers/FeatureLayer",
    "esri/renderers/SimpleRenderer",
    "esri/symbols/PictureMarkerSymbol",
    "esri/symbols/SimpleLineSymbol",
    "esri/symbols/SimpleMarkerSymbol",
    "esri/tasks/FeatureSet",
    "esri/tasks/QueryTask",
    "esri/tasks/query",
    "./lrscommon/js/form/MeasurePicker",
    "./lrscommon/js/form/RoutePicker",
    "./lrscommon/js/LrsWidget",
    "./lrscommon/js/tasks/serviceInfoCache",
    "./lrscommon/js/util/domain",
    "./lrscommon/js/util/geometry",
    "./lrscommon/js/util/i18n",
    "./lrscommon/js/util/routeName",
    "./lrscommon/js/util/utils"
], function(
    array, declare, lang, Deferred, DeferredList, domAttr, domConstruct, domStyle, string, CheckBox, Select, LayerStructure, SelectionManager,
    CSVUtils, Color, graphicsUtils, FeatureLayer, SimpleRenderer, PictureMarkerSymbol, SimpleLineSymbol, SimpleMarkerSymbol, FeatureSet, QueryTask, Query,
    MeasurePicker, RoutePicker, LrsWidget, serviceInfoCache, domainUtils, geometryUtils, i18nUtils, routeNameUtils, utils
) {
    return declare([LrsWidget], {

        baseClass: 'jimu-widget-lrswidget',
        _networkLayer: null,
        _eventLayerCheckboxes: null,
        _layerStructure: null,
        _overlayLayerNodeId: null,

        _onLrsLoaded: function() {
            this._layerStructure = LayerStructure.getInstance();
            this._setRouteInputConfig();
            this._setMeasureInputConfig();
            this._populateNetworkSelect();
            this._populateEventLayers();
            this.showContent();
        },

        _setRouteInputConfig: function() {
            array.forEach([this._fromRouteInput, this._toRouteInput], function(routeInput) {
                routeInput.selectOnGraphicsLayer = true;
                routeInput.set("config", {
                    mapManager: this._mapManager
                });
            }, this);
            this._toRouteInput.set("fromRouteForm", this._fromRouteInput);
            this._fromRouteInput.set("toRouteForm", this._toRouteInput);
        },

        _setMeasureInputConfig: function() {
            this._fromMeasureInput.set("config", {
                mapManager: this._mapManager,
                routeInput: this._fromRouteInput
            });
            this._fromMeasureInput.set("selectionSymbol", this._mapManager.getFromMeasureSymbol());
            this._fromMeasureInput.set("measurePrecision", this._mapManager.measurePrecision);

            this._toMeasureInput.set("config", {
                mapManager: this._mapManager,
                routeInput: this._toRouteInput
            });
            this._toMeasureInput.set("selectionSymbol", this._mapManager.getToMeasureSymbol());
            this._toMeasureInput.set("measurePrecision", this._mapManager.measurePrecision);
        },

        _populateNetworkSelect: function() {
            this._networkSelect.removeOption(this._networkSelect.getOptions());
            var networkLayers = this._mapManager.lrsServiceConfig.networkLayers;
            var options = [];
            array.forEach(networkLayers, function(networkLayer) {
                options.push({
                    label: networkLayer.name,
                    value: networkLayer.id.toString()
                });
            });
            this._networkSelect.addOption(options);
            this._onNetworkSelectChange();
        },

        _onNetworkSelectChange: function() {
            var networkLayer = utils.findLayer(this._networkSelect.get("value"), this._mapManager.lrsServiceConfig.networkLayers);
            if (networkLayer && networkLayer != this._networkLayer) {
                this.set("networkLayer", networkLayer);
            }
        },

        _setNetworkLayerAttr: function(val) {
            if (this._networkLayer != val) {
				//Search by Route_Name
				val.routeNameFieldName = "Route_Name";
				//
                this._networkLayer = val;
                this._makeNetworkLayerVisible();
                this._fromRouteInput.set("networkLayer", this._networkLayer);
                if (this._networkLayer.supportsLines) {
                    this._toRouteInput.makeRouteSelections = true;
                    this._toRouteInput.set("networkLayer", this._networkLayer);
                    this._toMeasureInput.set("routeInput", this._toRouteInput);
                    domStyle.set(this._toRouteDiv, "display", "table-row");
                    domAttr.set(this._fromRouteLabel, "innerHTML", routeNameUtils.getFromRouteLabel(this._networkLayer));
                    domAttr.set(this._toRouteLabel, "innerHTML", routeNameUtils.getToRouteLabel(this._networkLayer));
                } else {
                    this._toRouteInput.clearSelection();
                    this._toMeasureInput.set("routeInput", this._fromRouteInput);
                    this._toRouteInput.makeRouteSelections = false;
                    this._toRouteInput.deactivate();
                    this._toRouteInput.setRouteValues({
                        routeId: null,
                        routeName: null,
                        routeFeature: null
                    }, false);
                    domStyle.set(this._toRouteDiv, "display", "none");
                    domAttr.set(this._fromRouteLabel, "innerHTML", routeNameUtils.getRouteLabel(this._networkLayer));
                }
                domAttr.set(this._fromMeasureLabel, "innerHTML", string.substitute(this.nls.fromMeasureWithUnits, [utils.getUnitsString(this._networkLayer.unitsOfMeasure, true)]));
                domAttr.set(this._toMeasureLabel, "innerHTML", string.substitute(this.nls.toMeasureWithUnits, [utils.getUnitsString(this._networkLayer.unitsOfMeasure, true)]));
            }
        },

        /*
         * Makes the selected network layer visible on the map if it isn't already
         */
        _makeNetworkLayerVisible: function() {
            var layerId = this._networkLayer ? this._networkLayer.id : null;
            this._mapManager.makeLrsLayerVisible(layerId);
        },

        /*
         * Creates the event layer checkboxes
         */
        _populateEventLayers: function() {
            var eventsDiv = "_eventsDiv";
            var allEvents = this._mapManager.lrsServiceConfig.eventLayers;
            var half = allEvents.length/2;
            this._eventLayerCheckboxes = array.map(allEvents, function(eventLayer, i) {
                var parent = eventsDiv + (i < half ? "1":"2");
                parent = eventsDiv + "1";
                var label = domConstruct.create("label", {innerHTML: eventLayer.name, style: {display: "block"}}, this[parent]);
                var check = new CheckBox({
                    value: eventLayer.id,
                    checked: false
                });
                domConstruct.place(check.domNode, label, "first");
                return check;
            }, this);
        },

        /*
         * Gets the routes and measures from the inputs
         */
        _getRoutesAndMeasures: function() {
            var defd = new Deferred();

            var defds = [
                this._fromMeasureInput.getMeasure(),
                this._toMeasureInput.getMeasure(),
                this._fromRouteInput.getRouteValues()
            ];
            if (this._networkLayer && this._networkLayer.supportsLines) {
                defds.push(this._toRouteInput.getRouteValues());
            }

            new DeferredList(defds).then(lang.hitch(this, function(responses) {
                var fromMeasureValues = responses[0][1];
                var toMeasureValues = responses[1][1];
                var fromRouteValues = responses[2][1];
                var toRouteValues = responses.length > 3 ? responses[3][1] : null;
                defd.resolve({fromMeasureValues: fromMeasureValues, toMeasureValues: toMeasureValues, fromRouteValues: fromRouteValues, toRouteValues: toRouteValues});
            }));

            return defd;
        },

        /*
         * Makes sure the routes are valid and if lines are supported that the from and to route are on the same line
         */
        _areRoutesValid: function(fromRouteValues, toRouteValues) {
            var fromInvalid = fromRouteValues == null || fromRouteValues.routeId == null || fromRouteValues.routeId == undefined;
            if (fromInvalid) {
                if (this._networkLayer.supportsLines) {
                    this.showMessage(this.nls.enterFromRoute);
                } else {
                    this.showMessage(this.nls.enterRoute);
                }
                return false;
            }

            if (this._networkLayer.supportsLines) {
                var toInvalid = !this._toRouteInput.get("isValidRoute");
                if (toInvalid) {
                    this.showMessage(this.nls.invalidToRoute);
                    return false;
                }
            }

            return true;
        },

        /*
         * Make sure the measures are valid numbers
         */
        _areMeasuresValid: function(fromMeasureValues, toMeasureValues) {
            var fromInvalid = (utils.isValidNumber(fromMeasureValues.measure) && !fromMeasureValues.valid);
            var toInvalid = (utils.isValidNumber(toMeasureValues.measure) && !toMeasureValues.valid);
            if (fromInvalid && toInvalid) {
                this.showMessage(this.nls.invalidFromAndToMeasures);
                return false;
            } else if (fromInvalid) {
                this.showMessage(this.nls.invalidFromMeasure);
                return false;
            } else if (toInvalid) {
                this.showMessage(this.nls.invalidToMeasure);
                return false;
            }
            return true;
        },

        /*
         * Makes sure if to inputs are provided that from inputs were also provided
         */
        _areToInputsValid: function(toRouteValues, toMeasureValues, fromMeasureValues) {
            var message = null;
            if (toRouteValues) {
                var toMeasureProvided = utils.isValidNumber(toMeasureValues.measure);
                var fromMeasureProvided = utils.isValidNumber(fromMeasureValues.measure);
                var toRouteProvided = toRouteValues.routeId != null;
                if (toMeasureProvided && !toRouteProvided) {
                    message = this.nls.invalidToLocation;
                } else if (toMeasureProvided && toRouteProvided && !fromMeasureProvided) {
                    message = this.nls.invalidLineFromAndToMeasure;
                } else if (fromMeasureProvided && toRouteProvided && !toMeasureProvided) {
                    message = this.nls.invalidToLocation;
                }
            }
            if (message) {
                this.showMessage(message);
                return false;
            }
            return true;
        },

        /*
         * Gets a partial route geometry based on measures
         */
        _getPartialRoute: function(routeId, toRouteId, fromMeasure, toMeasure) {
            var defd = new Deferred();
            var map = this._mapManager.map;
            var networkLayer = this._networkLayer;
            var location = {
                routeId: routeId,
                fromMeasure: fromMeasure,
                toMeasure: toMeasure
            };
            if (toRouteId) {
                location.toRouteId = toRouteId;
            }
            var params = {
                locations: [location],
                outSR: map.spatialReference.toJson()
            };

            this._mapManager.lrsServiceTask.measureToGeometry(networkLayer.id, params).then(lang.hitch(this, function(response) {
                var foundLocation = null;
                if (response && response.locations && response.locations.length > 0) {
                    foundLocation = utils.first(response.locations, function(loc) {
                        return loc.status === "esriLocatingOK";
                    }, this);
                }
                if (foundLocation) {
                    defd.resolve(geometryUtils.create(foundLocation));
                } else {
                    defd.reject("No full matches found");
                }
            }), lang.hitch(this, function(err) {
                defd.reject(err);
            }));
            return defd;
        },

        _selectAllEvents: function() {
            array.forEach(this._eventLayerCheckboxes, function(eventCheck) {
                eventCheck.set("checked", true);
            }, this);
        },

        _clearAllEvents: function() {
            array.forEach(this._eventLayerCheckboxes, function(eventCheck) {
                eventCheck.set("checked", false);
            }, this);
        },

        /*
         * Generate report (csv) of selected events
         */
        _runReport: function() {
          var eventMasterList = [];
          var routeId = null;
          var routeName = null;
          var maxAttributeCount = 0;

          var eventLayers = this._getSelectedEventLayers();
          if (eventLayers == null || eventLayers.length < 1) {
            this.showMessage(this.nls.noEventsSelected);
            return;
          }
          var layersProcessed = 0;
          var layersTotal = eventLayers.length;

          this.showBusy();
          this._getRoutesAndMeasures()
          .then(lang.hitch(this, function(routesAndMeasures) {
                var fromRouteValues = routesAndMeasures.fromRouteValues;
                var toRouteValues = routesAndMeasures.toRouteValues;
                var fromMeasureValues = routesAndMeasures.fromMeasureValues;
                var toMeasureValues = routesAndMeasures.toMeasureValues;
                if (
                  this._areRoutesValid(fromRouteValues, toRouteValues) &&
                  this._areMeasuresValid(fromMeasureValues, toMeasureValues) &&
                  this._areToInputsValid(toRouteValues, toMeasureValues, fromMeasureValues)
                )
                {
                  routeId = fromRouteValues.routeId;
                  routeName = fromRouteValues.routeName;
					        var fromMeasure = fromMeasureValues.measure;
                  var toMeasure = toMeasureValues.measure;

                  var AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
                  var processLayerFunction = async function runIt(sentThis, eventLayer){
                    var eventName = eventLayer.name;
                    var eventType = eventLayer.type;

                    var jsonContents = sentThis._getAttributeKey('./widgets/RoadLog/log_attributes_config.json');
                    var obj = JSON.parse(jsonContents);
                    var eventLayerAttributeFields = null;
                    try {
                      eventLayerAttributeFields = obj.EventLayers.filter(function(val) {
                        return val.Name === eventName;
                      })[0].Attributes;
                    }
                    catch(error) {
                      eventLayerAttributeFields = [];
                    }

                    var attributeCount = eventLayerAttributeFields.length;
                    if (attributeCount > maxAttributeCount) {
                      maxAttributeCount = attributeCount;
                    }

                    var queryService = sentThis._mapManager.lrsMapLayerConfig.url + '/' + eventLayer.id;
                    var queryTask = new QueryTask(queryService);
                    var query = new Query();
                    query.returnGeometry = false;
                    query.where = sentThis._getWhereParameter(routeId, fromMeasure, toMeasure, eventType);
                    query.outFields = ["*"];

                    if (eventType === "esriLRSPointEventLayer") {
                      await queryTask.execute(query, lang.hitch(sentThis, function(response){
                        array.forEach(response.features, function(feature) {
                          //Start and End measures
                          var eventMeasure = feature.attributes.MPT;
                          var eventAttributes = sentThis._getEventAttributes(eventLayerAttributeFields, feature);

                            // generate json objects from attribute table fields
                            var eventJson = {
                              "Route ID": routeId,
                              "Route Name": routeName,
                              "Measure": eventMeasure,
                              "Feature": eventName,
                              "LocationSort": 2,
                              "Location": "Point"
                            };

                            //Add Attributes Unique to this Event Layer
                            var attributeIndex = 0;
                            array.forEach(eventAttributes, function(attribute){
                              var fieldNameObject = {};
                              eventJson["Attribute" + (attributeIndex + 1).toString()] = eventLayerAttributeFields[attributeIndex].toString() + ': ' + eventAttributes[attributeIndex].toString();
                              attributeIndex++;
                            }, sentThis);

                            eventMasterList.push(eventJson);
                        }, sentThis); //End Feature forEach
                      })); //End queryTask
                    } //End if PointEventLayer
                    if (eventType === "esriLRSIntersectionEventLayer") {}
                    if (eventType === "esriLRSLinearEventLayer") {

                      await queryTask.execute(query, lang.hitch(sentThis, function(response){
                        array.forEach(response.features, function(feature) {
                          //Start and End measures
                          var eventStart = fromMeasure != null && feature.attributes.From_MPT < fromMeasure ? fromMeasure: feature.attributes.From_MPT;
                          var eventEnd = toMeasure != null && feature.attributes.To_MPT > toMeasure ? toMeasure : feature.attributes.To_MPT;
                          var eventAttributes = sentThis._getEventAttributes(eventLayerAttributeFields, feature);

                            // generate json objects from attribute table fields
                            var eventStartJson = {
                              "Route ID": routeId,
                              "Route Name": routeName,
                              "Measure": eventStart,
                              "Feature": eventName,
                              "LocationSort": 3,
                              "Location": "Begin"
                            };

                            var eventEndJson = {
                              "Route ID": routeId,
                              "Route Name": routeName,
                              "Measure": eventEnd,
                              "Feature": eventName,
                              "LocationSort": 1,
                              "Location": "End"
                            };

                            //Add Attributes Unique to this Event Layer
                            var attributeIndex = 0;
                            array.forEach(eventAttributes, function(attribute){
                              var fieldNameObject = {};
                              eventStartJson["Attribute" + (attributeIndex + 1).toString()] = eventLayerAttributeFields[attributeIndex].toString() + ': ' + eventAttributes[attributeIndex].toString();
                              eventEndJson["Attribute" + (attributeIndex + 1).toString()] = eventLayerAttributeFields[attributeIndex].toString() + ': ' + eventAttributes[attributeIndex].toString();
                              attributeIndex++;
                            }, sentThis);

                            eventMasterList.push(eventStartJson);
                            eventMasterList.push(eventEndJson);
                        }, sentThis); //End Feature forEach
                      })); //End queryTask
                    } //End if LinearEventLayer
                  } //End processLayerFunction;

                  var sendThis = this;
                  var layerProcess = [];
                  eventLayers.map(eventLayer => {
                    layerProcess.push(processLayerFunction(sendThis, eventLayer));
                  });

                  Promise.all(layerProcess).then(function(){
                    sendThis._downloadFile(routeId, eventMasterList, maxAttributeCount);
                    sendThis.hideBusy();
                  })


                } //End If Valid
              }))
            },

        /*
         * Sort JSON and download as CSV
         */
        _downloadFile: function(routeId, eventMasterList, maxAttributeCount){
          //Sort by measure and then ocation type
          eventMasterList.sort(function(a, b) {
            if (a.Measure === b.Measure) {
              return a.LocationSort - b.LocationSort;
            }
            return a.Measure - b.Measure;
          });

          //Setup CSV columns with LocationSort removed
          var csvColumns = ['Route ID','Route Name','Measure','Feature','Location'];
          var attributeNumber = 1;
          while (attributeNumber <= maxAttributeCount) {
            csvColumns.push("Attribute" + attributeNumber.toString());
            attributeNumber++;
          }
          CSVUtils.exportCSV("RoadLog_" + routeId.toString(), eventMasterList, csvColumns);
          },

		/*
		 * Get Attribute Key for Events
		 */
		_getAttributeKey: function(pathName){
			var Httpreq = new XMLHttpRequest(); // a new request
			Httpreq.open("GET",pathName,false);
			Httpreq.send(null);
			return Httpreq.responseText;
			},

		/*
		 * Get Attributes for Event
		 */
		_getEventAttributes: function(fieldNames, feature){
			var eventAttributeValues = []

			array.forEach(fieldNames, function(fieldName) {
				var fieldValue = feature.attributes[fieldName];
				eventAttributeValues.push(fieldValue);
				}, this);
			return eventAttributeValues ;
			},

      /*
  		 * Get Where Parameter
  		 */
  		_getWhereParameter: function(routeId, fromMeasure, toMeasure, eventType) {
        var whereParam = "Route_ID = '" + routeId.toString() + "'";

        if (eventType === "esriLRSLinearEventLayer") {
          if (fromMeasure !== null) {
            whereParam = whereParam + ' AND To_MPT >= ' + fromMeasure.toString();
          }
          if (toMeasure !== null) {
            whereParam = whereParam + ' AND From_MPT <= ' + toMeasure.toString();
          }
        }
        else {
          if (fromMeasure !== null) {
            whereParam = whereParam + ' AND MPT >= ' + fromMeasure.toString();
          }
          if (toMeasure !== null) {
            whereParam = whereParam + ' AND MPT <= ' + toMeasure.toString();
          }
        }
        return whereParam;
  		},

        _getSelectedEventLayers: function() {
            var layers = [];
            array.forEach(this._eventLayerCheckboxes, function(eventCheck) {
                if (eventCheck.get("checked")) {
                    var layer = null;
                    array.some(this._mapManager.lrsServiceConfig.eventLayers, function(eventLayer) {
                        if (eventLayer.id == eventCheck.value) {
                            layer = eventLayer;
                            return true;
                        }
                        return false;
                    }, this);
                    if (layer) {
                        layers.push(layer);
                    }
                }
            }, this);
            return layers;
        },

        onClose: function() {
            this._fromMeasureInput.setMeasure(null, null, false);
            this._toMeasureInput.setMeasure(null, null, false);
            this._toRouteInput.setRouteValues({}, false);
            this._fromRouteInput.setRouteValues({}, false);
            this._fromMeasureInput.deactivate();
            this._toMeasureInput.deactivate();
            this._toRouteInput.deactivate();
            this._fromRouteInput.deactivate();
        }

    });
});
