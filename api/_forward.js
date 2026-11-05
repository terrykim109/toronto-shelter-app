const app = require("../server");

function send(route, req, res) {
  const url = req.url || "/";
  const queryAt = url.indexOf("?");
  const pathname = queryAt === -1 ? url : url.slice(0, queryAt);
  const search = queryAt === -1 ? "" : url.slice(queryAt);

  if (pathname !== route) {
    req.url = route + search;
  }

  return app(req, res);
}

module.exports = { send };
