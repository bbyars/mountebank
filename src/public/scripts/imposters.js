'use strict';
/*global $:false */
/*global document:false */
/*global window:false */
/*global Q:false */

function ajax (settings) {
    // Convert jQuery's broken promises to Q's and return xhr regardless of success or failure
    return Q.promise(function (resolve) {
        $.ajax(settings).then(function (data, textStatus, xhr) {
            delete xhr.then;
            resolve(xhr);
        }, function (xhr) {
            delete xhr.then;
            resolve(xhr);
        });
    });
}

function setRequest (verb, path, json) {
    var domain = window.location.href.replace('http://', '').split('/')[0],
        requestText = verb + ' ' + path + '\n' +
            'Host: ' + domain + '\n' +
            'Accept: application/json';
    if (json) {
        requestText += '\nContent-Type: application/json\n\n' + json;
    }

    $('#api-request').text(requestText);
}

function setResponse (xhr) {
    var response = 'HTTP/1.1 ' + xhr.status + ' ' + xhr.statusText + '\n' +
        xhr.getAllResponseHeaders() + '\n' +
        xhr.responseText;
    $('#api-response').text(response);
    return Q(xhr);
}

function request (verb, path, json) {
    setRequest(verb, path, json);
    return ajax({ url: path, type: verb, data: json}).then(setResponse);
}

function updateLinks () {
    $('a').on('click', function () {
        var link = $(this),
            row = link.closest('tr'),
            imposter = (row.attr('id') || '').replace('imposter-', ''),
            url = '/imposters/' + imposter,
            action = link.attr('class').replace('-icon', '');

        switch (action) {
            case 'inspect':
                request('GET', url);
                break;
            case 'delete':
                request('DELETE', url).done(function () {
                    row.fadeOut(500, row.remove);
                });
                break;
            case 'add':
                $('#add-dialog').dialog('open');
                break;
        }
        return false;
    });
}

function buildJSON () {
    var json = { protocol: $('#protocol').val() };
    if ($('#port').val()) {
        json.port = parseInt($('#port').val());
    }
    if ($('#name').val()) {
        json.name = $('#name').val();
    }
    if ($('#protocol').val() === 'tcp') {
        json.mode = $('#mode').val();
    }
    return JSON.stringify(json, null, 4);
}

function addRow (port) {
    ajax({ url: '/imposters/' + port, type: 'GET', dataType: 'html'}).done(function (xhr) {
        $('#imposters tr:last').before(xhr.responseText);
        updateLinks();
    });
}

$(document).ready(function () {
    updateLinks();

    $('#protocol').on('change', function () {
        if ($('#protocol').val() === 'tcp') {
            $('#mode-block').show();
        }
        else {
            $('#mode-block').hide();
        }
    });

    $('#add-dialog').dialog({
        autoOpen: false,
        height: 500,
        width: '60%',
        modal: true,
        title: 'Add imposters...',
        position: { my: 'center center' },
        buttons: [
            {
                text: 'Create imposter',
                click: function () {
                    request('POST', '/imposters', buildJSON()).done(function (xhr) {
                        if (xhr.status === 201) {
                            $('form').trigger('reset');
                            var port = JSON.parse(xhr.responseText).port;
                            addRow(port);
                        }
                    });
                    $(this).dialog('close');
                }
            }
        ]
    });
});
