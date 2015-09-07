'use strict';

// for new Buffer([0,1,2,3]).toJSON()
//      - v0.10 returns [0.1,2,3]
//      - v0.12 returns { type: 'Buffer', data: [0,1,2,3] }
function bufferJSON (buffer) {
    var result = buffer.toJSON();
    return result.data ? result.data : result;
}

module.exports = {
    bufferJSON: bufferJSON
};
