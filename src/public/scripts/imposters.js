'use strict';

/* global Q */

const predicateExplanations = {
    equals: 'a request field must match exactly',
    deepEquals: 'a request object graph must match exactly',
    contains: 'a request field must contain a substring',
    startsWith: 'a request field must start with a substring',
    endsWith: 'a request field must end with a substring',
    matches: 'a request field must match a regular expression',
    exists: 'a request field must exist or not exist depending on the value',
    not: 'inverts the sub-predicates',
    or: 'logically ORs the sub-predicates',
    and: 'logically ANDs the sub-predicates',
    inject: 'passes the entire request to an injected JavaScript function'
};

const responsesExplanations = {
    is: 'a canned response that you provide',
    proxy: 'a response that comes from a downstream system',
    inject: 'determines the response from a JavaScript function'
};

const predicateGenerator = {
    // Quite ugly - context is expected to be set when the predicate dialog opens
    context: null,
    generateTcp: () => {
        const type = $('select', predicateGenerator.context).val(),
            field = $('#tcpRequestField').val(),
            value = $('#tcpRequestValue').val(),
            predicate = {},
            json = JSON.parse($('code', predicateGenerator.context).text());

        $('#addTcpPredicate').trigger('reset');
        predicate[type] = {};
        predicate[type][field] = value;
        json.push(predicate);
        $('code', predicateGenerator.context).text(JSON.stringify(json));
    }
};

const explain = (cell, explanations) => {
    const select = $('select', cell),
        explanation = $('span', cell);

    select.on('change', () => {
        // In Mac Chrome, it seems the selection doesn't change sometimes unless the select
        // loses focus.  This next line seems to reduce the frequency of that, but it may
        // just be a combination of superstition and ignorance...
        console.log($(this).val());
        explanation.text(explanations[$(this).val()]);
    });
    select.trigger('change');
};

const StubList = {
    create: () => {
        const forEachRow = fn => {
            const rows = $('#stubs tr');
            for (let i = 2; i < rows.length - 1; i += 1) {
                fn(rows[i]);
            }
        };

        const add = () => {
            const index = $('#stubs tr').length - 3,
                row = $('#stubs tr.template').clone(),
                predicatesCell = $('td', row)[1],
                responsesCell = $('td', row)[2];

            row.removeClass('template');
            $(row.children('td')[0]).text(index);
            explain(predicatesCell, predicateExplanations);
            explain(responsesCell, responsesExplanations);

            const link = $('a', predicatesCell);
            link.click(() => {
                let protocol = $('#protocol').val();
                if (protocol === 'https') {
                    protocol = 'http';
                }
                predicateGenerator.context = predicatesCell;
                $(`#add-${protocol}-predicate-dialog`).dialog('open');
            });
            $('#stubs tr:last').before(row);
        };

        const reset = () => {
            forEachRow(row => {
                row.remove();
            });
        };

        const toJSON = () => {
            const json = [];

            forEachRow(row => {
                const stub = {},
                    predicatesCell = $('td', row)[1],
                    predicates = JSON.parse($('code', predicatesCell).text()),
                    responsesCell = $('td', row)[2],
                    responses = JSON.parse($('code', responsesCell).text());

                if (predicates.length > 0) {
                    stub.predicates = predicates;
                }
                if (responses.length > 0) {
                    stub.responses = responses;
                }

                json.push(stub);
            });
            return json;
        };

        return { add, reset, toJSON };
    }
};

const stubs = StubList.create();

const ajax = settings =>
    // Convert jQuery's broken promises to Q's and return xhr regardless of success or failure
    Q.promise(resolve => {
        $.ajax(settings).then((data, textStatus, xhr) => {
            delete xhr.then;
            resolve(xhr);
        }, xhr => {
            delete xhr.then;
            resolve(xhr);
        });
    });

const setRequest = (verb, path, json) => {
    const domain = window.location.href.replace('http://', '').split('/')[0];
    let requestText = verb + ' ' + path + '\n' +
            'Host: ' + domain + '\n' +
            'Accept: application/json';
    if (json) {
        requestText += '\nContent-Type: application/json\n\n' + json;
    }

    $('#api-request').text(requestText);
};

const setResponse = xhr => {
    const response = 'HTTP/1.1 ' + xhr.status + ' ' + xhr.statusText + '\n' +
        xhr.getAllResponseHeaders() + '\n' +
        xhr.responseText;
    $('#api-response').text(response);
    return Q(xhr);
};

const request = (verb, path, json) => {
    setRequest(verb, path, json);
    return ajax({ url: path, type: verb, data: json }).then(setResponse);
};

const updateLinks = () => {
    $('a').off('click');

    $('#imposters a').on('click', () => {
        const link = $(this),
            row = link.closest('tr'),
            imposter = (row.attr('id') || '').replace('imposter-', ''),
            url = `/imposters/${imposter}`,
            action = link.attr('class').replace('-icon', '');

        switch (action) {
            case 'inspect':
                request('GET', url);
                break;
            case 'delete':
                request('DELETE', url).done(() => {
                    row.fadeOut(500, row.remove);
                });
                break;
            case 'add':
                $('#add-dialog').dialog('open');
                break;
        }
        return false;
    });

    $('#stubs a').on('click', () => {
        stubs.add();
    });
};

const buildJSON = () => {
    const json = { protocol: $('#protocol').val() };

    if ($('#port').val()) {
        json.port = parseInt($('#port').val());
    }
    if ($('#name').val()) {
        json.name = $('#name').val();
    }
    if ($('#protocol').val() === 'tcp') {
        json.mode = $('#mode').val();
    }

    if (stubs.toJSON().length > 0) {
        json.stubs = stubs.toJSON();
    }

    return JSON.stringify(json, null, 4);
};

const addImposterRow = port => {
    ajax({ url: `/imposters/${port}`, type: 'GET', dataType: 'html' }).done(xhr => {
        $('#imposters tr:last').before(xhr.responseText);
        updateLinks();
    });
};

const createImposter = () => {
    request('POST', '/imposters', buildJSON()).done(xhr => {
        if (xhr.status === 201) {
            $('form').trigger('reset');
            stubs.reset();
            const port = JSON.parse(xhr.responseText).port;
            addImposterRow(port);
        }
    });
};

const createDialog = (selector, title, clickCallback) => {
    $(selector).dialog({
        autoOpen: false,
        height: 600,
        width: '60%',
        modal: true,
        title: title,
        position: { my: 'center center' },
        buttons: [
            {
                text: 'Create',
                click: () => {
                    clickCallback();
                    $(this).dialog('close');
                }
            }
        ]
    });
};

$(document).ready(() => {
    updateLinks();

    $('#protocol').on('change', () => {
        if ($('#protocol').val() === 'tcp') {
            $('#mode-block').show();
        }
        else {
            $('#mode-block').hide();
        }
    });

    createDialog('#add-dialog', 'Add imposter...', createImposter);
    createDialog('#add-http-predicate-dialog', 'Add predicate...', () => {});
    createDialog('#add-tcp-predicate-dialog', 'Add predicate...', predicateGenerator.generateTcp);
});
