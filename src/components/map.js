import React, { Component } from 'react';
import * as d3 from 'd3';
import L from 'leaflet';
import regression from 'regression';

import Timeline from './timeline.js';
import Legend from './legend.js';
import HorizontalBarChart from './horizontal_bar_chart.js'

const MINZOOM = 13;
const DISTZOOM = MINZOOM + 1;
const MAXZOOM = DISTZOOM + 1;
const STARTLOC = [44.94, -93.10];
const FLYDURATION = 0.6;

export default class Map extends Component {
  constructor(props) {
    super(props);
    this.createMap = this.createMap.bind(this);
    this.destroyMap = this.destroyMap.bind(this);
    this.selectMap = this.selectMap.bind(this);
    this.updateMap = this.updateMap.bind(this);
    this.districtAllocated = this.districtAllocated.bind(this);
    this.toggleShowChanges = this.toggleShowChanges.bind(this);
    this.clearYearSelection = this.clearYearSelection.bind(this);
    this.state = {
      portion: undefined,
      projection: undefined,
      showChange: false
    }
  }

  // Type check for data types passed into map.js then create map if correct.
  componentDidMount() {
    let osmMap = L.map("osm-map", {
      //dragging: false,
      zoomControl: false,
      boxZoom: false,
      doubleClickZoom: false,
      //scrollWheelZoom: false,
      zoomDelta: 0
    }).setView(STARTLOC, 13);

    /* TODO: Don't use OSM's tile server. It is not intended for this. */
    L.tileLayer('https://a.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors, <a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>.',
      minZoom: MINZOOM,
      maxZoom: MAXZOOM
    }).addTo(osmMap);

    let zoom_handler = function() { this.updatePointPositions(); }.bind(this);
    osmMap.on("zoomend", zoom_handler);
    this.osmMap = osmMap;

    this.createMap();
  }

  componentDidUpdate(prevProps, prevState) {
    if (this.props.years.length === 0) {
      this.updateMap();
    } else {
      if ((this.props.years[0] !== prevProps.years[0] || this.props.years[1] !== prevProps.years[1])) {
        if (this.state.portion !== undefined) {
          this.selectMap(this.state.portion, this.state.projection, this.props.years);
        }

        const years = this.parseYearData(this.props.years);
        this.updateMap(years);
      }
    }
  }

  createMap(years) {
    L.geoJSON(this.props.geodata.features, {
      style: feature => ({fillOpacity: 1}),
      onEachFeature: function(feature, layer) {
        feature.properties.bounds_calculated = layer.getBounds();
      }.bind(this)
    }).addTo(this.osmMap);

    d3.select("#osm-map").selectAll("path")
      .classed("map-piece", true)
      .data(this.props.geodata.features);

    this.updateMap(years);
  }

  updatePointPositions() {
    let osmMap = this.osmMap;
    d3.selectAll(".map-point, .ping-marker")
      .attr("cx", (d, i) =>
            osmMap.latLngToLayerPoint({lat: d.latitude, lon: d.longitude}).x)
      .attr("cy", (d, i) =>
            osmMap.latLngToLayerPoint({lat: d.latitude, lon: d.longitude}).y)
      .attr("r", 10);
  }

  updateMap(years) {
    const that = this;
    const projection = d3.geoMercator().fitSize([800, 800], this.props.geodata);
    const data = (years !== undefined) ? years : this.props.data;
    const amountAllocated = this.state.showChange ? this.districtChanged(data) : this.districtAllocated(data);

    const min_max = d3.extent(amountAllocated,
      d => (d !== undefined && d.name !== "Citywide") ?
      d.value : 0);

    if (!this.state.showChange) {
      min_max[0] = 0;
    } else {
      min_max.splice(1, 0, 0);
    }

    let colors = this.state.showChange ? ["#ca0020", "#f7f7f7", "#0571b0"] : ["#eff3ff", "#08519c"];

    const colorScale =
          d3.scaleLinear().domain(min_max)
          .range(colors);

    let drag = d3.drag();
    let pieces = d3.selectAll("#osm-map path");
    drag.on("end", function() {
      d3.event.sourceEvent.preventDefault();
    });
    pieces.call(drag);

    pieces.on("click", function (d, i) {
      if (d3.event.defaultPrevented) {
        return;
      }

      that.setState({ portion: d, projection:projection });
      that.selectMap(d, projection, that.props.years);

      d3.select("body").on("keydown", function() {
        if (d3.event.key === "Escape") {
          d3.select(".infobox")
            .classed("infobox-hidden", true);
          that.unSelectMap();
          that.setState({ portion: undefined, projection:undefined});
          that.clearYearSelection();
          d3.select("body").on("keydown", null);
        }
      });
    })
      .attr('fill', function (d, i) {
        let amt = amountAllocated[i];
        return colorScale(amt !== undefined ? amt.value : 0);
      });
  }

  unSelectMap() {
    d3.selectAll('.map-point, .ping-marker').remove();

    this.osmMap.flyTo(STARTLOC, MINZOOM, {animate: true, duration: FLYDURATION});
  }

  // Set other paths to lower opacity.
  selectMap(portion, projection, year) {
    const improvementsScale = d3.scaleOrdinal()
          .domain(['Community Facilities', 'Internal Service', 'Streets and Utilities', 'Residential and Economic Development'])
          .range(['#a6cee3', '#1f78b4', '#b2df8a', '#33a02c']);

    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    });

    let infobox = d3.select(".infobox");
    const populateInfobox = (infobox, pts) => {
      infobox.html("").classed("infobox-hidden", false);
      if (pts.length > 1) {
        const infobox = d3.select(".infobox");
        infobox.append('h2').html(portion !== undefined ? portion.properties.name2 : "");
        infobox.append('ul').selectAll('li')
          .data(pts.sort((f, s) => f.year < s.year))
          .enter().append('li')
          .html((d, i) => d.title + " ("+ d.year + ")")
          .on("click", selectPoint())
          .style("border-left-color", function(d, i) {
            return improvementsScale(d.service);
          });
      } else {
        let d = pts[0];
        infobox.html("<div class=\"infobox-dept\" style=\"border-top-color: " + improvementsScale(d.service) + "\">"+ d.department + "</div>" +
                     "<div class=\"infobox-amount\">" + formatter.format(d.amount) + "</div>" +
                     "<h2>" + d.title + " (" + d.year + ")</h2>" +
                     "<p>" + d.description + "</p>");
      }
    };

    let osmMap = this.osmMap;
    const create_ping = function(d, i) {
      /* TODO: this should only work if selected through the map, not
       * from the list. */
      const ping_pos = osmMap.latLngToLayerPoint({lat: d.latitude, lon: d.longitude});
      const ping_duration = "1.5s";
      const radius = 100;
      const begin = "0s";

      d3.selectAll(".ping-marker").remove();
      let ping = d3.select("#osm-map svg")
          .selectAll(".ping-marker")
          .data([d]).enter()
          .append("circle");

      ping.attr("stroke", "black")
        .attr("stroke-width", 2)
        .attr("fill", "none")
        .attr("cx", ping_pos.x)
        .attr("cy", ping_pos.y)
        .classed("ping-marker", true);

      ping.append("animate")
        .attr("attributeName", "r")
        .attr("begin", begin)
        .attr("dur", ping_duration)
        .attr("repeatCount", "indefinite")
        .attr("values", "0; " + radius)
        .attr("keySplines", "0.165 0.84 0.44 1")
        .attr("keyTimes", "0; 1")
        .attr("calcMode", "spline");

      ping.append("animate")
        .attr("attributeName", "opacity")
        .attr("begin", begin)
        .attr("dur", ping_duration)
        .attr("repeatCount", "indefinite")
        .attr("values", "1; 0");
    };

    const selectPoint = circle => function (d, i) {
      const dist_between = (l, r) => {
        const compute_pos = n => {
          let b = n.getBoundingClientRect();
          return {x: b.left, y: b.top};
        };

        let lp = compute_pos(l), rp = compute_pos(r);
        return Math.sqrt((lp.x - rp.x) ** 2 + (lp.y - rp.y) ** 2);
      };

      d3.selectAll(".ping-marker").remove();
      let clicked_node = this;

      /* If I was to do this for real, I would use a proper spatial
       * data structure instead of a functional for loop. */
      if (circle) {
        let covered_points = d3.selectAll('.map-point').filter(function() {
          return (dist_between(clicked_node, this) < 21);
        });

        populateInfobox(infobox, covered_points.data());
        if (covered_points.size() <= 1) {
          create_ping(d, i);
        }
      } else {
        populateInfobox(infobox, [d]);
        create_ping(d, i);
      }

      osmMap.flyTo([d.latitude, d.longitude], MAXZOOM,
                   {animate: true, duration: FLYDURATION});
    };

    const years = this.parseYearData(year);
    const data = (years !== undefined) ? years : this.props.data;
    const districtPoints = this.parseDistrict(data, portion);
    const map = d3.select("#osm-map");
    let g = map.select('g');

    d3.selectAll('.map-point, .ping-marker').remove();

    populateInfobox(infobox, districtPoints);
    let pts = g.selectAll('circle')
        .data(districtPoints)
        .enter().append('circle')
        .classed("map-point", true)
        .attr("r", 7.5)
        .attr("fill", function(d,i) {
          return improvementsScale(d.service);
        })
        .on("click", selectPoint(true));

    this.osmMap.fitBounds(portion.properties.bounds_calculated,
                          {maxZoom: DISTZOOM});
    this.updatePointPositions();
  }

  destroyMap() {
    d3.selectAll("#osm-map path").remove();
  }

  districtAllocated(data) {
    // TODO: Redo district amount.
    let districtAmount = [
      {name:"1",value:0},{name:"2",value:0},{name:"3",value:0},{name:"4",value:0},{name:"5",value:0},{name:"6",value:0},{name:"7",value:0},{name:"8",value:0},{name:"9",value:0},{name:"10",value:0},{name:"11",value:0},{name:"12",value:0},{name:"13",value:0},{name:"14",value:0},{name:"15",value:0},{name:"16",value:0},{name:"17",value:0},{name:"Citywide",value:0}
    ]

    const map_key = {
      "1":0,"2":1,"3":2,"4":3,"5":4,"6":5,"7":6,"8":7,"9":8,"10":9,"11":10,"12":11,"13":12,"14":13,"15":14,"16":15,"17":16,"Citywide":17,
    }

    const financialData = data;
    for (let i = 0; i < financialData.length; i++) {
      let districts = financialData[i].district.split(",");
      for (let c = 0; c < districts.length;  c++) {
        if (!isNaN(parseInt(financialData[i].amount))) {
          const index = map_key[districts[c].trim()];
          if (index !== undefined) {
            districtAmount[index].value += parseInt(financialData[i].amount)/districts.length;
          }
        }
      }
    }

    return districtAmount;
  }

  districtChanged(data) {
    return data.reduce((a, c) => {
      let dists = c.district.split(",");
      for (let d of dists) {
        let i = Number(d);
        if (!isNaN(i) && Number(c.amount) > 0) {
          let pair = [Number(c.year), Number(c.amount)];
          if (a[i - 1] === undefined) {
            a[i - 1] = [pair];
          } else {
            a[i - 1].push(pair);
          }
        }
      }
      return a;
    }, []).map((vs, i) => {
      return {
        name: String(i + 1),
        value: regression.linear(vs).equation[0]
      };
    });
  }

  parseDistrict(data, portion) {
    let districtData = [];
    for (let i = 0; i < data.length; i++) {
      const latitude = parseFloat(data[i].latitude);
      const longitude = parseFloat(data[i].longitude);
      if (d3.geoContains(portion, [longitude, latitude])) {
        districtData.push(data[i]);
      }
    }
    return districtData;
  }

  parseYearData(years) {
    if (years !== undefined && years.length !== 0) {
      if (years[0] === 2003) {
        years[0] = 2004;
      }
      if (years[0] === 2020) {
        years[0] = 2019;
      }
      if (years[1] === 2003) {
        years[1] = 2004;
      }
      if (years[1] === 2020) {
        years[1] = 2019;
      }

      let i = years[0];
      let yearlyData = [];
      while (i <= years[1]) {
        for (let x = 0; x < this.props.data.length; x++) {
          if(parseInt(this.props.data[x].year) === i) {
            yearlyData.push(this.props.data[x]);
          }
        }
        i++;
      }
      return yearlyData;
    }
  }

  toggleShowChanges() {
    this.setState({ showChange: !this.state.showChange}, () => {
      const years = this.parseYearData(this.props.years);
      this.updateMap(years);
    });
  }

  clearYearSelection() {
    this.props.yearSelector([]);
  }

  render() {
    return (
      <div className="Map">
	<div id="osm-map"></div>
        <Timeline data={this.props.data} yearSelector={this.props.yearSelector} selectedYears={this.props.years}/>
        <div className="container-fluid hud-ui">
          <div className="row">
            <div className="col-3">
              <div className="row">
                <div className="col-6">
                  <button className="card" onClick={this.toggleShowChanges}>
                    Show {this.state.showChange ? "total spending" : "change over time"}
                  </button>
                </div>
                <div className="col-6">
                  <button className="card" onClick={this.clearYearSelection}>
                    Clear timeline selection
                  </button>
                </div>
              </div>
              <div className="row">
                <div className="infobox infobox-hidden card"></div>
              </div>
            </div>
            <div className="col-6 spacer">
              <h1 className="app-title card">Saint Paul Capital Improvements</h1>
            </div>
            <div className="col-3">
              <div className="card">
                <Legend name="legend" data={this.props.data} years={this.props.years} changed={this.state.showChange}/>
              </div>
              <div className="card">
                <HorizontalBarChart name="barChart" width="400" height="400" data={this.props.data} years={this.props.years} district={this.state.portion !== undefined ? this.state.portion.properties.district : undefined} />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
