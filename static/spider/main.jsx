var _ = require('underscore');
var urls = require('./urls');

var SpiderEntry = React.createClass({
  mixins: [React.addons.PureRenderMixin],
  iconForEntry: function(entry) {
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
         ? <i className="fa fa-check" title="This resource is now cached."/>
         : <i className="fa fa-circle-o-notch fa-spin" title="This resource is being cached."/>}
        </td>
        <td>
        <span className="label label-default" title={"HTTP " + entry.statusCode + " " + entry.status}>{entry.statusCode}</span>
        </td>
        <td>
        {this.iconForEntry(entry)}
        </td>
        <td>
        <a href={urls.rewriteURL(url)} target="_blank">{url}</a>
        </td>
      </tr>
    );
  }
});

var App = React.createClass({
  mixins: [React.addons.PureRenderMixin],
  getInitialState: function() {
    return {
      entries: [],
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
    this.socket.send(JSON.stringify({
      type: 'spider',
      options: {
        url: 'http://mozilla.org/',
        ttl: 0
      }
    }));
  },
  handleSocketMessage: function(e) {
    var data = JSON.parse(e.data);
    if (data.type == 'responseStart') {
      this.setState({
        entries: this.state.entries.concat(_.extend({
          done: false
        }, _.omit(data, 'type')))
      });
    } else if (data.type == 'responseEnd') {
      var updates = {};
      var entries = this.state.entries;
      var index = _.indexOf(entries, _.findWhere(entries, {
        url: data.url
      }));
      if (index == -1) return;
      updates[index] = {
        $merge: {
          done: true
        }
      };
      this.setState(React.addons.update(this.state, {
        entries: updates
      }));
    } else if (data.type == 'end') {
      this.setState({
        done: true
      });
    }
  },
  render: function() {
    return (
      <div>
      <p>{this.state.done ? "Done spidering." : "Spidering..."}</p>
      <table className="table">
      <tbody>
      {this.state.entries.map(function(entry) {
        return <SpiderEntry key={entry.url} entry={entry}/>;
      })}
      </tbody>
      </table>
      </div>
    );
  }
});

function socketURL(path) {
  var protocol = location.protocol == 'https:' ? 'wss:' : 'ws:';
  return protocol + '//' + location.host + path;
}

React.render(
  <App socketURL={socketURL('/spider')}/>,
  document.getElementById("app")
);
