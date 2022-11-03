import React, { Component } from 'react';
import * as d3 from 'd3';
import Map from '../components/map.js';
import Legend from '../components/legend.js'
import HorizontalBarChart from '../components/horizontal_bar_chart.js';

export default class CapitalImprovement extends Component {
  constructor(props) {
    super(props);
    this.loadData = this.loadData.bind(this);
    this.selectedYears = this.selectedYears.bind(this);
    this.state = {
        district_map: [],
        capital_improvement_data: [],
        selectedYear: []
    }
  }

  componentDidMount() {
    this.loadData();
  }

  componentDidUpdate() {

  }

  loadData() {
    const that = this;
    d3.csv("https://raw.githubusercontent.com/jackstanek/stpaul-census-tracts/master/Saint%20Paul%20CIB_Location%20Updates%2004.21.19.csv").then(function(data) {
      that.setState({
        capital_improvement_data: data
      });
    });

    d3.json(process.env.PUBLIC_URL + "/stpaul_neighborhoods.geojson").then(function(data) {
      that.setState({
        district_map: data
      });
    });
  }

  selectedYears(extent) {
    this.setState({
      selectedYear: extent
    })
  }

  ready() {
    return this.state.district_map.length === undefined
      && this.state.capital_improvement_data.length !== 0;
  }

  render() {
    return (
      <div className="CapitalImprovement">
        { this.ready() ? (<Map geodata={this.state.district_map} data={this.state.capital_improvement_data} years={this.state.selectedYear} yearSelector={this.selectedYears}/>) : (<p className="loading"> Loading Map Data...</p>) }
      </div>
    );
  }
}
