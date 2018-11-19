'use strict';

const assert = require('assert'),
    date = require('../../src/util/date');

describe('date', () => {
    describe('#when', () => {
        it('should be today if date is the same', () => {
            assert.strictEqual(date.howLongAgo('2015-01-09', '2015-01-09'), 'today');
        });

        it('should be yesterday for 1 day ago of same month', () => {
            assert.strictEqual(date.howLongAgo('2015-01-09', '2015-01-10'), 'yesterday');
        });

        it('should be yesterday for last day of previous month if today is the first day of next month', () => {
            assert.strictEqual(date.howLongAgo('2015-01-31', '2015-02-01'), 'yesterday');
        });

        it('should be yesterday for last day of previous year if today is first day of year', () => {
            assert.strictEqual(date.howLongAgo('2014-12-31', '2015-01-01'), 'yesterday');
        });

        it('should be this week for two days ago', () => {
            assert.strictEqual(date.howLongAgo('2015-01-08', '2015-01-10'), 'this week');
        });

        it('should be this week for six days ago', () => {
            assert.strictEqual(date.howLongAgo('2015-01-04', '2015-01-10'), 'this week');
        });

        it('should be last week for seven days ago', () => {
            assert.strictEqual(date.howLongAgo('2015-01-03', '2015-01-10'), 'last week');
        });

        it('should be last week for 13 days ago', () => {
            assert.strictEqual(date.howLongAgo('2014-12-28', '2015-01-10'), 'last week');
        });

        it('should be this month for 14 days ago in same month', () => {
            assert.strictEqual(date.howLongAgo('2015-01-17', '2015-01-31'), 'this month');
        });

        it('should be this month for 30 days ago in same month', () => {
            // Adding time to avoid UTC conversion pushing it back a month
            assert.strictEqual(date.howLongAgo('2015-01-01T18:00:00.000Z', '2015-01-31'), 'this month');
        });

        it('should be empty fo 14 days ago last month', () => {
            assert.strictEqual(date.howLongAgo('2014-12-31', '2015-01-14'), '');
        });
    });
});
