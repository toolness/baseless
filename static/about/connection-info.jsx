var _ = require('underscore');

var ConnectionInfo = React.createClass({
  render: function() {
    var location = this.props.location;
    var ipconfig = this.props.ipconfig;

    var origins = [];

    var LOOPBACK_HOSTNAMES = ['localhost', '127.0.0.1'];

    if (LOOPBACK_HOSTNAMES.indexOf(location.hostname.toLowerCase()) == -1) {
      origins.push(location.protocol + '//' + location.host);
    }

    ipconfig.hostnames.forEach(function(hostname) {
      origins.push(location.protocol + '//' + hostname + ':' +
                   ipconfig.port);
    });

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
