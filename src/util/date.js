'use strict';

/** @module */

function toEpochWithoutTime (text) {
    // be sure to exclude time so we get accurate text
    const dateTextWithoutTime = new Date(Date.parse(text)).toDateString();
    return Date.parse(dateTextWithoutTime);
}

function sameMonth (firstEpoch, secondEpoch) {
    const first = new Date(firstEpoch),
        second = new Date(secondEpoch);

    return first.getFullYear() === second.getFullYear() && first.getMonth() === second.getMonth();
}

/**
 * Translates the distance between two dates within a month of each other to human readable text
 * @param {string} thenText - The start date
 * @param {string} testNowText - Ignore, used for testing purposes only.
 * @returns {string}
 */
function howLongAgo (thenText, testNowText) {
    const nowText = testNowText ? testNowText : new Date(Date.now()).toISOString(), // testNow is just for testing purposes
        then = toEpochWithoutTime(thenText),
        now = toEpochWithoutTime(nowText),
        millisecondsInDay = 24 * 60 * 60 * 1000,
        daysAgo = Math.floor((now - then) / millisecondsInDay);

    if (daysAgo === 0) {
        return 'today';
    }
    else if (daysAgo === 1) {
        return 'yesterday';
    }
    else if (daysAgo < 7) {
        return 'this week';
    }
    else if (daysAgo < 14) {
        return 'last week';
    }
    else if (sameMonth(then, now)) {
        return 'this month';
    }
    else {
        return '';
    }
}

module.exports = { howLongAgo };
