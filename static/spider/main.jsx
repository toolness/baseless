var urlModule = require('url');
var querystring = require('querystring');
var _ = require('underscore');
var urls = require('./urls');

var URL_ARGS = querystring.parse(window.location.search.slice(1));
var DEFAULT_URL = URL_ARGS.url || "";

var SpiderEntry = React.createClass({
  mixins: [React.addons.PureRenderMixin],
  iconForEntry: function(entry) {
    if (entry.error) return null;

    var type = (entry.contentType || '???').split(";")[0];
    var mainType = type.split('/')[0];
    var title = "This is a file of type " + type + ".";
    var icon = "fa-file-o";

    if (entry.redirectURL) {
      title = "This URL redirects to " + entry.redirectURL + ".";
      icon = "fa-mail-forward";
    } else if (type == 'text/html') {
      icon = "fa-file-code-o";
    } else if (mainType == 'text') {
      icon = "fa-file-text-o";
    } else if (mainType == 'image') {
      icon = "fa-file-image-o";
    }

    return (
      <a href={entry.url} target="_blank" style={{
        color: 'inherit'
      }} title={title}>
        <i className={"fa " + icon}/>
      </a>
    );
  },
  render: function() {
    var entry = this.props.entry;
    var url = entry.url;
    return (
      <tr>
        <td>
        {entry.done
         ? (entry.error
            ? <i className="fa fa-warning" title={entry.error}/>
            : <i className="fa fa-check" title="This resource is now cached."/>)
         : <i className="fa fa-circle-o-notch fa-spin" title="This resource is being cached."/>}
        </td>
        <td>
        <span className="label label-default" title={"HTTP " + entry.statusCode + " " + entry.status}>{entry.statusCode}</span>
        </td>
        <td>
        {this.iconForEntry(entry)}
        </td>
        <td className="url-cell">
        <a href={urls.rewriteURL(url)} target="_blank" style={{
        }}>{url}</a>
        </td>
      </tr>
    );
  }
});

var SpiderForm = React.createClass({
  mixins: [React.addons.PureRenderMixin],
  handleSubmit: function(e) {
    e.preventDefault();
    if (this.props.disabled) return;

    var form = this.getDOMNode();
    var url = form.url.value;
    var urlObj = urlModule.parse(url);
    var linkRadius = parseInt(form.linkRadius.value);
    var follow = form.follow.value;
    var linkPrefix = null;

    if (follow != "all")
      linkPrefix = urlObj.protocol + '//' + urlObj.host;

    if (follow == "sameDomainAndPath")
      linkPrefix += urlObj.path;

    this.props.onSubmit({
      url: url,
      linkPrefix: linkPrefix,
      ttl: linkRadius
    });
  },
  render: function() {
    return (
      <form onSubmit={this.handleSubmit}>
        <div className="form-group">
          <label>Starting URL</label>
          <input type="url" name="url" className="form-control" placeholder="http://" defaultValue={DEFAULT_URL} required/>
        </div>
        <div className="row">
          <div className="col-sm-6">
            <div className="form-group">
              <label>Follow link radius</label>
              <select className="form-control" name="linkRadius" defaultValue="0">
                {_.range(0, 6).map(function(i) {
                  return <option key={i} value={i}>{i}</option>
                })}
              </select>
            </div>
          </div>
          <div className="col-sm-6">
            <div className="radio">
              <label>
                <input type="radio" name="follow" value="all" defaultChecked/> Follow all links
              </label>
            </div>
            <div className="radio">
              <label>
                <input type="radio" name="follow" value="sameDomain"/> Follow only links on the same domain
              </label>
            </div>
            <div className="radio">
              <label>
                <input type="radio" name="follow" value="sameDomainAndPath"/> Follow only links on the same domain and path
              </label>
            </div>
          </div>
        </div>
        <button type="submit" className="btn btn-primary" disabled={this.props.disabled}>Start Spidering</button>
      </form>
    );
  }
});

var App = React.createClass({
  mixins: [React.addons.PureRenderMixin],
  getInitialState: function() {
    return {
      entries: [],
      ready: false,
      started: false,
      done: false
    };
  },
  componentDidMount: function() {
    var socket = new WebSocket(this.props.socketURL);
    socket.addEventListener('open', this.handleSocketOpen);
    socket.addEventListener('message', this.handleSocketMessage);
    this.socket = socket;
  },
  handleSocketOpen: function(e) {
    this.setState({ready: true});
  },
  updateEntry: function(url, update) {
    var updates = {};
    var entries = this.state.entries;
    var index = _.indexOf(entries, _.findWhere(entries, {
      url: url
    }));
    if (index == -1) {
      return this.addEntry(_.extend({
        url: url
      }, update));
    }
    updates[index] = {$merge: update};
    this.setState(React.addons.update(this.state, {
      entries: updates
    }));
  },
  addEntry: function(entry) {
    this.setState({
      entries: this.state.entries.concat(entry)
    });
  },
  handleSocketMessage: function(e) {
    var data = JSON.parse(e.data);
    if (data.type == 'responseStart') {
      this.addEntry(_.extend({
          done: false
      }, _.omit(data, 'type')));
    } else if (data.type == 'responseEnd') {
      this.updateEntry(data.url, {
        done: true
      });
    } else if (data.type == 'error') {
      this.updateEntry(data.url, {
        done: true,
        error: data.message
      });
    } else if (data.type == 'end') {
      this.setState({
        done: true
      });
    }
  },
  handleSubmit: function(info) {
    this.socket.send(JSON.stringify({
      type: 'spider',
      options: info
    }));
    this.setState({
      entries: [],
      started: true,
      lastSpiderOptions: info,
      done: false
    });
  },
  getZipURL: function() {
    return '/archive/zip?' +
           querystring.stringify(this.state.lastSpiderOptions);
  },
  render: function() {
    return (
      <div>
      {this.state.ready
       ? <SpiderForm onSubmit={this.handleSubmit} disabled={this.state.started && !this.state.done}/>
       : null}
      <br/>
      {this.state.started
       ? <div>
           <p>{this.state.done
               ? <span>Done spidering. <a className="btn btn-default btn-xs" href={this.getZipURL()} target="_blank">
                   <i className="fa fa-download"/> Download ZIP</a>
                 </span>
               : <span>Spidering&hellip; <i className="fa fa-circle-o-notch fa-spin"/></span>}
           </p>
           <table className="table">
             <tbody>
             {this.state.entries.map(function(entry) {
               return <SpiderEntry key={entry.url} entry={entry}/>;
             })}
             </tbody>
           </table>
         </div>
       : null}
      </div>
    );
  }
});

function socketURL(path) {
  var protocol = location.protocol == 'https:' ? 'wss:' : 'ws:';
  return protocol + '//' + location.host + path;
}

var app = React.render(
  <App socketURL={socketURL('/spider')}/>,
  document.getElementById("app")
);
