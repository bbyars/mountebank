function create () {
    return {
        headers: {},
        send: function (body) { this.body = body; },
        setHeader: function (key, value) { this.headers[key] = value; },
        absoluteUrl: function (endpoint) { return 'http://localhost' + endpoint; }
    };
}

module.exports = {
    create: create
};
