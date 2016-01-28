/*
Add this file to $(jupyter --data-dir)/nbextensions/gist.js
And load it with:

require(["nbextensions/gist"], function (gist_extension) {
    console.log('gist extension loaded');
    gist_extension.load_ipython_extension();
});

or add the following to your jupyter_notebook_config.py to
load for every notebook

from notebook.services.config import ConfigManager
cm = ConfigManager()
cm.update('notebook', {"load_extensions": {"gist": True}})
*/

function get_base_path() {
    var loc = window.location;
    var proto = loc.protocol;
    var host = loc.hostname;
    var port = loc.port;

    var base = proto + "//" + host;
    if (parseInt(port) != 80) {
        base += ":" + port;
    }
    return base;
}

function url_path_split(path) {
    var idx = path.lastIndexOf('/');
    if (idx === -1) {
        return ['', path];
    } else {
        return [ path.slice(0, idx), path.slice(idx + 1) ];
    }
}

function is_url_valid(url) {
    return /^(https?|s?ftp):\/\/(((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:)*@)?(((\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\.(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\.(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\.(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5]))|((([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.)+(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.?)(:\d*)?)(\/((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)+(\/(([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)*)*)?)?(\?((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)|[\uE000-\uF8FF]|\/|\?)*)?(#((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)|\/|\?)*)?$/i.test(url);
}

define(function () {
    var github_redirect_uri = get_base_path() + "/create_gist";
    var gist_notebook = function () {
        // Save the notebook and create a checkpoint to ensure that we create
        // the gist using the most up-to-date content
        Jupyter.notebook.save_checkpoint();

        var github_client_id = Jupyter.notebook.config.data.oauth_client_id;
        // Get notebook path and encode it in base64
        // Characters like # get decoded by the github API and will mess up
        // getting the file path on the server if we use URI percent encoding,
        // so we use base64 instead
        var nb_path = window.btoa(Jupyter.notebook.base_url + Jupyter.notebook.notebook_path);

        // Start OAuth dialog
        window.open("https://github.com/login/oauth/authorize?client_id=" + github_client_id +
          "&scope=gist&redirect_uri=" + github_redirect_uri + "?nb_path=" + nb_path);
    };

    var load_from_url = function() {
        var url = prompt("Enter the URL to a Gist or a .ipynb.");
        if (url == "" || url == null) {
            // prompt() returns "" if empty value, or null 
            // if user clicked cancel, want to abort in either case
            return;
        }
        if (!is_url_valid(url)) {
            alert('Invalid URL.');
            return;
        }
        var parser = document.createElement('a');
        parser.href = url;
        if (parser.hostname.indexOf('gist.github.com') > -1) {
            // this is a gist URL, extract the raw_url for the .ipynb file
            load_from_gist_url(url);
        } else if (url.indexOf('.ipynb', url.length - '.ipynb'.length) !== -1) {
            // URL is a raw .ipynb file
            var nb_pathname_parts = parser.pathname.split('/');
            var filename = decodeURIComponent(nb_pathname_parts[nb_pathname_parts.length - 1]);
            download_nb_on_server(url, filename, false);
        }
    }

    var load_from_gist_url = function(url) {
        // this is a gist URL, extract the raw_url for the .ipynb file
        var gist_url_parts = url.split('/');
        var gist_id = gist_url_parts[gist_url_parts.length-1];

        var gist_api_url = "https://api.github.com/gists/" + gist_id;

        var xhr = new XMLHttpRequest();
        xhr.onreadystatechange = function() {
            if (xhr.readyState == XMLHttpRequest.DONE) {
                if (xhr.status == 200) {
                    var res = JSON.parse(xhr.responseText);
                    for (var filename in res.files) {
                        if (!res.files.hasOwnProperty(filename)) continue;
                        if (filename.endsWith('.ipynb')) {
                            download_nb_on_server(res.files[filename].raw_url, filename, false);
                        }
                    }
                    console.log("no ipynb files found");
                    console.log(res);
                } else if (xhr.status == 404) {
                    alert("Gist not found")
                } else {
                    alert("Couldn't load Gist.")
                }
            }
        }
        xhr.open("GET", gist_api_url, true);
        xhr.send(null);
    }

    var download_nb_on_server = function(url, name, force_download) {
        var xhr = new XMLHttpRequest();
        var nb_info = {
            nb_url: url,
            nb_name: window.btoa(name),
            force_download: force_download
        }
        xhr.open("POST",  "/download_notebook", true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.onload = function () {
            if (xhr.status == 409) {
                // 409 Conflict
                // used if file already exists
                var newname = prompt("File already exists. Please enter a new name.\nNote: This may overwrite existing files.", 
                                     name);
                if (newname == "" || newname == null) {
                    // prompt() returns "" if empty value, or null 
                    // if user clicked cancel, want to abort in either case
                    return;
                }
                download_nb_on_server(url, newname, true);
            } else if (xhr.status == 200) {
                window.open(url_path_split(Jupyter.notebook.notebook_path)[0] + encodeURIComponent(this.responseText));
            } else if (xhr.status == 400) {
                alert("File did not download");
            }
        };
        xhr.send(JSON.stringify(nb_info));
    }

    var load_user_gists = function() {
        // TODO: Figure out how to deal with page redirect when obtaining GitHub access code
        // For now, prompt user for their GitHub username to load their public gists
        var github_username = prompt("Please enter your GitHub username in order to retrieve your public gists.");
        if (github_username == "" || github_username == null) {
            // Do not send a request if user did not input anything
            return;
        };

        var gist_api_url = "https://api.github.com/users/"+github_username+"/gists";

        if (!is_url_valid(gist_api_url)) {
            alert('GitHub username is invalid.');
        };

        var xhr = new XMLHttpRequest();
        xhr.open("GET", gist_api_url, true);
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.onload = function(){
            Jupyter.dialog.modal({
                title: "Gists",
                body: format_user_gists(xhr.responseText),
                buttons: {
                    "OK": {}
                }
            });
        };
        xhr.send(null);
    };

    var format_user_gists = function(responseText) { 
        var body = $('<table/>').addClass("table");
        var header = $('<tr/>').addClass("row list_header");
        header.append("<th>"+"Filename"+"</th>");
        header.append("<th>"+"Description"+"</th>");
        header.append("<th>"+"Last Updated" + "</th>");
        header.append("<th>"+"Gist URL"+"</th>");
        body.append(header);
        var row, button, files;
        var json_response = JSON.parse(responseText);
        for (var i=0; i<json_response.length; i++) {
            files = json_response[i].files;
            // Only load notebook gists 
            if (!files[Object.keys(files)[0]].filename.endsWith('.ipynb')) continue;
            // Create row containing gist information
            row = $('<tr/>').addClass("list_item row");
            row.append("<td>" + files[Object.keys(files)[0]].filename + "</td>");
            row.append("<td>" + json_response[i].description + "</td>");
            row.append("<td>" + json_response[i].updated_at + "</td>");
            // Create button to load notebook 
            button = $('<button>Load Gist</button>').addClass("btn btn-default btn-sm");
            button.click({url: json_response[i].html_url}, load_gist_from_click);
            button.appendTo(row);
            body.append(row);
        };

        return body;
    };

    var load_gist_from_click = function(event) {
        var url = event.data.url;
        load_from_gist_url(url);
    };

    var gist_button = function () {
        if (!Jupyter.toolbar) {
            $([Jupyter.events]).on("app_initialized.NotebookApp", gist_button);
            return;
        }
        if ($("#gist_notebook").length === 0) {
            Jupyter.toolbar.add_buttons_group([
                {
                    'label'   : 'save notebook as gist',
                    'icon'    : 'fa-github',
                    'callback': gist_notebook,
                    'id'      : 'gist_notebook'
                }, {
                    'label'   : 'load notebook from URL',
                    'icon'    : 'fa-link',
                    'callback': load_from_url,
                    'id'      : 'load_notebook_from_url'
                }, {
                    'label'   : 'load user gists',
                    'icon'    : 'fa-list-alt',
                    'callback': load_user_gists,
                    'id'      : 'load_user_gists',
                }
            ]);
        }
    };

    var load_ipython_extension = function () {
        gist_button();
    };

    return {
        load_ipython_extension: load_ipython_extension
    };
});