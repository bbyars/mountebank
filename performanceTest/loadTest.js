'use strict';

import http from 'k6/http';
import { sleep, check } from 'k6';

// init code -- start mb, etc

// config
export let options = {
    stages: [
        { duration: '2m', target: 10 },
        { duration: '5m', target: 50 },
        { duration: '10m', target: 100 },
        { duration: '5m', target: 50 },
        { duration: '2m', target: 10 }
    ]
};


// VU code
export default function () {
    let first = http.get('http://localhost:3000/test');
    check(first, { 'body check': (res) => parseInt(res.body) > 0 && parseInt(res.body) <= 10 });

    let second = http.get('http://localhost:3000/');
    check(second, { 'status check': (res) => res.status === 200 });
}

/*
export let options = {
    stages: [
        { duration: '2m', target: 10 },
        { duration: '5m', target: 50 },
        { duration: '10m', target: 100 },
        { duration: '5m', target: 50 },
        { duration: '2m', target: 10 }
    ]
};

// v2.4.0 run:
 running (24m04.8s), 000/100 VUs, 249310 complete and 0 interrupted iterations
 default ✓ [======================================] 000/100 VUs  24m0s

 ✗ body check
 ↳  98% — ✓ 246062 / ✗ 3248
 ✗ status check
 ↳  98% — ✓ 246044 / ✗ 3266

 checks.....................: 98.69% ✓ 492106 ✗ 6514
 data_received..............: 55 MB  38 kB/s
 data_sent..................: 40 MB  28 kB/s
 http_req_blocked...........: avg=24.71ms  min=0s     med=949µs    max=27.84s   p(90)=2.29ms   p(95)=2.81ms
 http_req_connecting........: avg=24.56ms  min=0s     med=896µs    max=27.84s   p(90)=2.19ms   p(95)=2.7ms
 http_req_duration..........: avg=68.12ms  min=0s     med=64.85ms  max=736.49ms p(90)=118.57ms p(95)=139.63ms
 http_req_receiving.........: avg=160.99µs min=0s     med=55µs     max=64.14ms  p(90)=92µs     p(95)=122µs
 http_req_sending...........: avg=88.61µs  min=0s     med=50µs     max=347.97ms p(90)=90µs     p(95)=141µs
 http_req_tls_handshaking...: avg=0s       min=0s     med=0s       max=0s       p(90)=0s       p(95)=0s
 http_req_waiting...........: avg=67.87ms  min=0s     med=64.69ms  max=731.15ms p(90)=118.32ms p(95)=139.28ms
 http_reqs..................: 498620 345.11884/s
 iteration_duration.........: avg=326.16ms min=2.48ms med=136.81ms max=31.2s    p(90)=253.33ms p(95)=300.24ms
 iterations.................: 249310 172.55942/s
 vus........................: 17     min=1    max=100
 vus_max....................: 100    min=100  max=100


// HEAD run
 running (24m00.0s), 000/100 VUs, 250589 complete and 0 interrupted iterations
 default ✓ [======================================] 000/100 VUs  24m0s

 ✗ body check
 ↳  99% — ✓ 250402 / ✗ 187
 ✗ status check
 ↳  99% — ✓ 250404 / ✗ 185

 checks.....................: 99.92% ✓ 500806 ✗ 372
 data_received..............: 56 MB  39 kB/s
 data_sent..................: 41 MB  28 kB/s
 http_req_blocked...........: avg=66.05ms  min=0s     med=977µs    max=26.33s  p(90)=2.29ms   p(95)=2.79ms
 http_req_connecting........: avg=65.89ms  min=0s     med=922µs    max=26.33s  p(90)=2.18ms   p(95)=2.68ms
 http_req_duration..........: avg=75.35ms  min=0s     med=68.2ms   max=8.71s   p(90)=125.33ms p(95)=143.33ms
 http_req_receiving.........: avg=162.8µs  min=0s     med=56µs     max=52.37ms p(90)=93µs     p(95)=124µs
 http_req_sending...........: avg=91.86µs  min=0s     med=51µs     max=27.98ms p(90)=93µs     p(95)=150µs
 http_req_tls_handshaking...: avg=0s       min=0s     med=0s       max=0s      p(90)=0s       p(95)=0s
 http_req_waiting...........: avg=75.09ms  min=0s     med=68.04ms  max=8.68s   p(90)=125.09ms p(95)=143.04ms
 http_reqs..................: 501178 348.030438/s
 iteration_duration.........: avg=323.32ms min=2.55ms med=141.92ms max=29.17s  p(90)=266.08ms p(95)=306.63ms
 iterations.................: 250589 174.015219/s
 vus........................: 11     min=1    max=100
 vus_max....................: 100    min=100  max=100
 */





/*
singleStub, no --datadir

 running (2m22.3s), 00/20 VUs, 24532 complete and 0 interrupted iterations
 default ✓ [======================================] 00/20 VUs  2m20s

 ✓ body check
 ✓ status check

 checks.....................: 100.00% ✓ 49064 ✗ 0
 data_received..............: 5.4 MB  38 kB/s
 data_sent..................: 4.0 MB  28 kB/s
 http_req_blocked...........: avg=23ms    min=203µs  med=946µs   max=24.7s    p(90)=1.81ms  p(95)=2.32ms
 http_req_connecting........: avg=22.94ms min=161µs  med=892µs   max=24.7s    p(90)=1.69ms  p(95)=2.22ms
 http_req_duration..........: avg=17.17ms min=839µs  med=15.21ms max=850.16ms p(90)=24.02ms p(95)=27.27ms
 http_req_receiving.........: avg=72.67µs min=26µs   med=55µs    max=12.08ms  p(90)=87µs    p(95)=106µs
 http_req_sending...........: avg=71.69µs min=23µs   med=50µs    max=8.8ms    p(90)=85µs    p(95)=111µs
 http_req_tls_handshaking...: avg=0s      min=0s     med=0s      max=0s       p(90)=0s      p(95)=0s
 http_req_waiting...........: avg=17.02ms min=745µs  med=15.07ms max=850.05ms p(90)=23.87ms p(95)=27.11ms
 http_reqs..................: 49064   344.864153/s
 iteration_duration.........: avg=80.57ms min=2.48ms med=33.42ms max=24.72s   p(90)=51.75ms p(95)=58.9ms
 iterations.................: 24532   172.432077/s
 vus........................: 11      min=1   max=20
 vus_max....................: 20      min=20  max=20
 */

/*
singleStub no --datadir, 2.4

 running (2m20.0s), 00/20 VUs, 24645 complete and 0 interrupted iterations
 default ✓ [======================================] 00/20 VUs  2m20s

 ✓ body check
 ✓ status check

 checks.....................: 100.00% ✓ 49290 ✗ 0
 data_received..............: 5.5 MB  39 kB/s
 data_sent..................: 4.0 MB  29 kB/s
 http_req_blocked...........: avg=23.99ms min=202µs  med=907µs   max=25.37s   p(90)=2.01ms  p(95)=2.46ms
 http_req_connecting........: avg=23.93ms min=158µs  med=854µs   max=25.37s   p(90)=1.92ms  p(95)=2.37ms
 http_req_duration..........: avg=15.37ms min=647µs  med=14.68ms max=578.24ms p(90)=22.59ms p(95)=24.63ms
 http_req_receiving.........: avg=71.69µs min=24µs   med=54µs    max=10.44ms  p(90)=85µs    p(95)=106µs
 http_req_sending...........: avg=71.18µs min=21µs   med=50µs    max=7.46ms   p(90)=84µs    p(95)=113µs
 http_req_tls_handshaking...: avg=0s      min=0s     med=0s      max=0s       p(90)=0s      p(95)=0s
 http_req_waiting...........: avg=15.23ms min=560µs  med=14.54ms max=577.2ms  p(90)=22.43ms p(95)=24.45ms
 http_reqs..................: 49290   352.01633/s
 iteration_duration.........: avg=78.95ms min=2.49ms med=32.25ms max=25.43s   p(90)=48.69ms p(95)=52.62ms
 iterations.................: 24645   176.008165/s
 vus........................: 1       min=1   max=20
 vus_max....................: 20      min=20  max=20
 */

/*
singleStub, --datadir

 ✗ body check
 ↳  99% — ✓ 18776 / ✗ 2
 ✓ status check

 checks.....................: 99.99% ✓ 37554 ✗ 2
 data_received..............: 4.2 MB 30 kB/s
 data_sent..................: 3.1 MB 22 kB/s
 http_req_blocked...........: avg=1.41ms  min=2µs    med=1.09ms  max=1.58s   p(90)=1.37ms   p(95)=1.62ms
 http_req_connecting........: avg=1.36ms  min=0s     med=1.04ms  max=1.58s   p(90)=1.31ms   p(95)=1.56ms
 http_req_duration..........: avg=46.75ms min=1.01ms med=4.34ms  max=24.42s  p(90)=73.78ms  p(95)=198.16ms
 http_req_receiving.........: avg=79.14µs min=29µs   med=56µs    max=12.08ms p(90)=82µs     p(95)=98µs
 http_req_sending...........: avg=55.43µs min=14µs   med=50µs    max=4.29ms  p(90)=70µs     p(95)=81µs
 http_req_tls_handshaking...: avg=0s      min=0s     med=0s      max=0s      p(90)=0s       p(95)=0s
 http_req_waiting...........: avg=46.61ms min=923µs  med=4.23ms  max=24.41s  p(90)=73.66ms  p(95)=198.06ms
 http_reqs..................: 37556  268.211815/s
 iteration_duration.........: avg=96.57ms min=5.71ms med=14.82ms max=24.44s  p(90)=206.83ms p(95)=384.41ms
 iterations.................: 18778  134.105908/s
 vus........................: 1      min=1   max=20
 vus_max....................: 20     min=20  max=20
 */
