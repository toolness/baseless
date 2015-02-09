var _ = require('underscore');

var ConnectionInfo = React.createClass({
  LOOPBACK_HOSTNAMES: ['localhost', '127.0.0.1'],
  isHostnameLoopback: function(hostname) {
    return this.LOOPBACK_HOSTNAMES.indexOf(hostname.toLowerCase()) != -1;
  },
  render: function() {
    var location = this.props.location;
    var ipconfig = this.props.ipconfig;

    var origins = [];

    if (!this.isHostnameLoopback(location.hostname)) {
      origins.push(location.protocol + '//' + location.host);
    }

    ipconfig.hostnames.forEach(function(hostname) {
      if (this.isHostnameLoopback(hostname)) return;
      origins.push(location.protocol + '//' + hostname + ':' +
                   ipconfig.port);
    }, this);

    origins = _.uniq(origins);

    return (
      <ul>
        {origins.map(function(url) {
          return <li key={url}><a href={url}>{url}</a></li>;
        })}
      </ul>
    );
  }
});

var connectionInfo = React.render(
  <ConnectionInfo ipconfig={window.IPCONFIG} location={window.location}/>,
  document.getElementById("connection-info")
);
