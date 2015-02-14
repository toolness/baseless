var urlModule = require('url');
var querystring = require('querystring');
var _ = require('underscore');
var urls = require('./lib/urls');

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
  labelForStatusCode: function(entry) {
    var title = "HTTP " + entry.statusCode + " " + entry.status;
    var labelClass = "label-default";

    if (entry.statusCode >= 200 && entry.statusCode < 300) {
      labelClass = "label-success";
    } else if (entry.statusCode >= 400 && entry.statusCode < 500) {
      labelClass = "label-warning";
    } else if (entry.statusCode >= 500) {
      labelClass = "label-danger";
    }

    return (
      <span className={"label " + labelClass} title={title}>
        {entry.statusCode}
      </span>
    );
  },
  render: function() {
    var entry = this.props.entry;
    var url = entry.url;
    return (
      <tr className={entry.error ? "warning" : null}>
        <td>
        {entry.done
         ? (entry.error
            ? <i className="fa fa-warning" title={entry.error}/>
            : <i className="fa fa-check" title="This resource is now cached."/>)
         : <i className="fa fa-circle-o-notch fa-spin" title="This resource is being cached."/>}
        </td>
        <td>
        {entry.wasAlreadyCached
         ? <i className="fa fa-database" title="The contents of this URL were previously cached."/>
         : <i className="fa fa-cloud" title="The contents of this URL were just retrieved from the internet and are now cached."/>}
        </td>
        <td>
        {this.labelForStatusCode(entry)}
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
                <input type="radio" name="follow" value="all"/> Follow all links <i className="fa fa-warning" title="Be careful with this option, you could accidentally spider a big chunk of the internet."/>
              </label>
            </div>
            <div className="radio">
              <label>
                <input type="radio" name="follow" value="sameDomain" defaultChecked/> Follow only links on the same domain
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

var InfiniteScrollSpideringLog = React.createClass({
  ENTRIES_CHUNKING_SIZE: 50,
  mixins: [React.addons.PureRenderMixin],
  getInitialState: function() {
    return {
      entriesToShow: this.ENTRIES_CHUNKING_SIZE
    };
  },
  componentDidMount: function() {
    this.intervalID = window.setInterval(this.showMore, 500);
    window.addEventListener('scroll', this.showMore);
  },
  componentWillUnmount: function() {
    window.clearInterval(this.intervalID);
    window.removeEventListener('scroll', this.showMore);
  },
  componentWillReceiveProps: function(nextProps) {
    if (nextProps.entries.length < this.props.entries.length) {
      // Looks like we just reset.
      this.setState(this.getInitialState());
    }
  },
  showMore: function() {
    var yTop = window.scrollY;
    var totalHeight = document.body.offsetHeight;
    var windowHeight = window.innerHeight;
    var entriesToShow = this.state.entriesToShow;

    if ((yTop + windowHeight >= totalHeight - (windowHeight / 3)) &&
        (this.props.entries.length > entriesToShow)) {
      this.setState({
        entriesToShow: entriesToShow + this.ENTRIES_CHUNKING_SIZE
      });
    }
  },
  render: function() {
    var entries = this.props.entries.slice(0, this.state.entriesToShow);

    return <SpideringLogSlice entries={entries}/>;
  }
});

var SpideringLogSlice = React.createClass({
  shouldComponentUpdate: function(nextProps) {
    if (this.props.entries.length != nextProps.entries.length)
      return true;
    return this.props.entries.some(function(entry, i) {
      return this.props.entries[i] !== nextProps.entries[i];
    }, this);
  },
  render: function() {
    return (
      <table className="table">
        <tbody>
        {this.props.entries.map(function(entry) {
          return <SpiderEntry key={entry.url} entry={entry}/>;
        })}
        </tbody>
      </table>
    );
  }
});

var App = React.createClass({
  mixins: [React.addons.PureRenderMixin],
  getInitialState: function() {
    return {
      entries: [],
      totalSize: 0,
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
    this.entryUrlIndexes = {};
  },
  handleSocketOpen: function(e) {
    this.setState({ready: true});
  },
  updateEntry: function(url, update) {
    var updates = {};
    var entries = this.state.entries;
    if (url in this.entryUrlIndexes) {
      updates[this.entryUrlIndexes[url]] = {$merge: update};
      this.setState(React.addons.update(this.state, {
        entries: updates
      }));
    } else {
      this.addEntry(_.extend({
        url: url
      }, update));
    }
  },
  addEntry: function(entry) {
    this.entryUrlIndexes[entry.url] = this.state.entries.length;
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
        size: data.size,
        done: true
      });
      this.setState({
        totalSize: this.state.totalSize + data.size
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
      totalSize: 0,
      started: true,
      lastSpiderOptions: info,
      done: false
    });
    this.entryUrlIndexes = {};
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
           <p>Cached {numberWithCommas(this.state.totalSize)} bytes over {this.state.entries.length} URLs.</p>
           <InfiniteScrollSpideringLog entries={this.state.entries}/>
         </div>
       : null}
      </div>
    );
  }
});

// http://stackoverflow.com/a/2901298
function numberWithCommas(x) {
  return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function socketURL(path) {
  var protocol = location.protocol == 'https:' ? 'wss:' : 'ws:';
  return protocol + '//' + location.host + path;
}

var app = React.render(
  <App socketURL={socketURL('/spider')}/>,
  document.getElementById("app")
);
