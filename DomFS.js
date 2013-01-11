/*
 DomFS.js - client-side DomFS Layer
 Kalan MacRow <kalanwm/at/cs/ubc/ca>

 DomFS classifies elements as either directory-like
 or file-like and implements the standard filesystem
 abstractions over a websocket. Directory and file names
 are exposed such that when composed into a path they
 form a legal XPath query that can be used to select
 elements from the DOM using the native XPath engine.

*/

var DomFS = {};


(function(module){

	// FUSE server to connect to
	module.server = '';
	// the websocket descriptor
	module.socket = null;
	// epoch defaults to page load time, determines ctimes, etc.
	module.epoch  = null;
	// user and group id of document owner
	module.uid    = 0;
	module.gud    = 0;

	// constants for file modes
	module.IFDIR  = 16384;
	module.IFLNK  = 40960;
	module.IFREG  = 32768;
	module.mode   = 0755;

	// tags that we consider directories
	module.dir_tags = ['HTML','HEAD','BODY','DIV','TABLE','FIELDSET','FIGURE','FORM',
						'IFRAME','HEADER','FOOTER','MAP','MENU','NAV','DL','TR','HGROUP',
						'COLGROUP','OPTGROUP','OL','UL','SELECT','DETAILS','DATALIST','VIDEO','AUDIO'];
	
	
	// tags that we consider to be files 
	// with contents determined by innerHTML
	module.file_tags = ['P','B','I','A','EM','SPAN','ABBR','ACRONYM','ADDRESS',
						'ARTICLE','ASIDE','BDI','BDO','BIG','SMALL','BLOCKQUOTE',
						'BUTTON','CAPTION','CENTER','CITE','CODE','TD','COMMAND',
						'DD','DEL','DFN','DT','FIGCAPTION','H1','H2','H3','H4','H5','H6',
						'LABEL','LEGEND','LI','MARK','METER','NOSCRIPT','OPTION',
						'OUTPUT','PRE','Q'];

	// tags that we consider to be files 
	// with contents determined by a "value"
	module.form_tags = [];

	// these implement the file system procedures
	module.commands = {
		create: function(path, mode) {
			var tag, xpar, node;

			tag = module.basename(path);
			xpar = path.substring(0, path.lastIndexOf('/'));
			node = module.node(xpar);
			
			if(node) {
				node.appendChild(document.createElement(tag));
				return true;
			}

			return false;
		},
		chmod: function(path, mode){
			module.mode = mode;
			return 0;
		},
		chown: function(path, uid, gid){
			module.uid = uid;
			module.gid = gid;
			return true;
		},
		read: function(path, size, offset, fh){
			var nodes, data;

			nodes = module.xpath(document, path);
			
			if(nodes.length) {
				data = module.contents(nodes[0]);
				 
				if(data.length > offset) { 
					data = data.substr(offset, size);
				} else {
					data = data.substr(0, size);
				}

			}
			return data;
		},
		readlink: function(path){

		},
		write: function(path, data, offset, fh){
			var nodes, buf, c0;

			nodes = module.xpath(document, path);
			if(nodes.length) {
				c0 = module.contents(nodes[0]);
				buf = c0.substr(0, offset) + data;

				if(offset + data.length < c0.length){
					buf += c0.substr(offset + data.length);
				}
				
				module.contents(nodes[0], buf);
				return data.length;
			}
			return 0;
		},
		truncate: function(path, length){
			var nodes, content;

			nodes = module.xpath(document, path);
			if(nodes.length) {
				content = module.contents(nodes[0]);
				content = content.substring(0, length);
				module.contents(nodes[0], content);
			}
			
			return true;
		},
		mkdir: function(path, mode){
			var node, par, tag, elm, p;

			tag = module.basename(path);
			if( (p = tag.indexOf('[')) != -1)
				tag = tag.substring(0, p);

			if(!module.isdirtag(tag))
				return false;

			par = path.substring(0, path.lastIndexOf('/'));

			node = module.node(par);

			if(node) {
				elm = document.createElement(tag);
				node.appendChild(elm);
			}

			return true;

		},	
		rmdir: function(path){
			return module.commands.unlink(path);
		},
		readdir: function(path, fh){
			var nodes, entries, counts;

			/* Directories (i.e <div>s) may contain multiple elements
			   of the same element tag name (eg, <p>) so we have to
			   use a 1-based index in addition to the tag name to name
			   each entry/element. Elements with globally unique ID attributes can
			   use those instead of their index. 
			*/
			counts = {};

			// add a wildard to the path to select all children
			if(path == '/') {
				path += '*';
			} else {
				path += '/*';
			}

			entries = [];
			nodes = module.xpath(document, path);
			
			// add all of the entries to a list
			for(var i = 0; i < nodes.length; i++) {
				var name = '';
				var node = nodes[i];

				if(!counts.hasOwnProperty(node.tagName)){
					counts[node.tagName] = 1;
				}

				name = node.tagName.toLowerCase();
				if(node.id){
					name += '[@id="' + node.id + '"]';
				}else{
					name += '[' + (counts[node.tagName]) + ']';
				}
				counts[node.tagName]++;
				entries.push(name);
			}

			return ['.','..'].concat(entries);

		},
		getattr: function(path, fh) {
			var file;
			var node;
			var ret = {
				st_ctime: module.epoch, st_atime: module.epoch, 
				st_mtime: module.epoch, st_nlink: 1,
				st_uid: module.uid, st_gid: module.gid
			};

			file = module.basename(path);

			// we don't support '.hidden' files right now
			if(file.charAt(0) == '.') {
				return null;
			}

			// stat /
			if(path == '/') {
				ret.st_mode = module.IFDIR | module.mode;
				ret.st_nlink = Math.min(2, document.childNodes.length);
				return ret;
			}

			node = module.node(path);

			if(!node) {
				// file/dir doesn't exist
				return null;
			}

			if(module.isdirtag(node.tagName)) {
				// it's directory-like
				ret.st_mode = module.IFDIR | module.mode;
				ret.st_nlink= Math.min(2, node.children.length);
			} else {
				// it's a regular file
				ret.st_mode = module.IFREG | module.mode;
				ret.st_size = module.contents(node).length;
			}
			
			return ret;

		},
		// extended attributes are implemented as attributes
		// on the HTML elements
		getxattr: function(path, name, pos) {
			
			if(path == '/')
				return '';

			var node = module.node(path);

			if(node && node.hasAttribute(name))
				return node.getAttribute(name);
			
			return '';
		},
		listxattr: function(path){

			if(path == '/')
				return [];

			var node = module.node(path);
			var attr = [];
			if(node && node.hasAttributes()) {
				for(var i = 0; i < node.attributes.length; i++)
					attr.push(node.attributes.item(i).nodeName);
			}
			return attr;
		},
		removexattr: function(path, name){

			if(path == '/')
				return true;

			var node = module.node(path);
			if(node && node.hasAttributes() && node.hasAttribute(name)) {
				node.removeAttribute(name);
			}
			return true;
		},
		setxattr: function(path, name, value, options, pos){

			if(path == '/')
				return true;

			var node = module.node(path);
			if(node) {
				if(name.toLowerCase() == 'style'){
					node.style.cssText = value;
				} else {
					node.setAttribute(name, value);
				}
			}	
			return true;
		},
		// rename lets you "mv" subtrees around
		rename: function(oldp, newp){
			var snode, tnode;
			snode = module.node(oldp);
			tnode = module.node(newp.substring(0, newp.lastIndexOf('/')));
			
			if(!snode || !tnode)
				return null;

			// todo: check tnode is a dir-like element? 
			snode.parentNode.removeChild(snode);
			tnode.appendChild(snode);
			return true;
		},
		symlink: function(target, source){
			return true;
		},
		unlink: function(path){
			var nodes;
			nodes = module.xpath(document, path);
			if(nodes.length){
				nodes[0].parentNode.removeChild(nodes[0]);
			}
			return true;
		},
		utimens: function(path, time){
			module.epoch = time ? time : module.utime();
			return true;
		}
	};

	// this runs on page load 
	module.init = function() {
		var server;

		if('domfs_server' in localStorage) {
			server = localStorage['domfs_server'];
		} else {
			server = prompt('Enter DomFS Server:');
		}

		if(server != '') {
			module.server = server;
			module.epoch = module.utime();
			localStorage['domfs_server'] = server;
			module.connect();
		}else{
			console.warn('DomFS: init');
		}
	};

	// connect to the FUSE server
	module.connect = function() {
		var socket = new WebSocket('ws://' + module.server, 'base64');
		socket.onopen = module.open;
		socket.onclose = module.close;
		socket.onerror = module.error;
		socket.onmessage = module.recv;
		module.socket = socket;
	};

	module.open = function() {
		console.log('DomFS: open');
	};

	module.close = function() {
		console.log('DomFS: close');
	};

	module.error = function() {
		console.error('DomFS: error');
	};

	// handle incoming messages (i.e RPC requests)
	module.recv = function(event) {
		var msg;

		// little utility to pretty-print RPC arguments
		function szargs(argss){
			var szs = [];
			for(var i = 0; i < argss.length; i++)
				szs.push(JSON.stringify(argss[i]));
			return szs.join(', ');
		}
		
		msg = JSON.parse(atob(event.data));

		// execute the RPC named by msg.cmd with args msg.args 
		res = module.commands[msg.cmd].apply(module, msg.args);

		// log the call
		console.log(msg.cmd + '(' + szargs(msg.args) + ') => ' + JSON.stringify(res));
		
		// serialize and send response
		module.send(res);
		
	};

	module.send = function(msg) {
		if(module.socket) {
			return module.socket.send(btoa(JSON.stringify(msg)));
		} else {
			DomFS.error('DomFS: send');
			return false;
		}	
	};

	module.utime = function(){
		return Math.floor(new Date().getTime()/1000);
	}

	// This is the workhorse of the module: it runs
	// an arbitrary xpath query through the browser's
	// xpath engine and extracts all of the matched 
	// dom nodes.
	module.xpath = function(ctx, path) {
		var nodes = [];
		var xpe = new XPathEvaluator();
		var res = xpe.createNSResolver(ctx.ownerDocument == null ?
    								   ctx.documentElement : 
    								   ctx.ownerDocument.documentElement);
		var rst = xpe.evaluate(path, ctx, res, 0, null);
		while (node = rst.iterateNext())
    		nodes.push(node);
  		return nodes;
	};

	module.node = function(path) {
		var nodes = module.xpath(document, path);
		return nodes.length ? nodes[0] : null;
	};

	module.basename = function(path) {
		return path.substr(path.lastIndexOf('/') + 1);
	};

	module.isdirtag = function(tag) {
		return module.dir_tags.indexOf(tag.toUpperCase()) != -1;
	}

	// Gets or sets the "contents" of a node. This
	// has different meaning for nodes of different
	// types (eg. a <p> vs. and <input type="text" />)
	module.contents = function(node) {
		var data  = '';
		var ndata = arguments[1];  
		switch(node.tagName){
			case 'P':
			case 'H1':
			case 'H2':
			case 'H3':
			case 'H4':
			case 'SPAN':
			case 'SMALL':
			case 'TITLE':
				data = node.innerHTML;
				if(ndata) node.innerHTML = ndata;
			break;
			case 'META':
				data = node.content || '';
				if(ndata) node.content = ndata;
			break;
			case 'SCRIPT':
			case 'STYLE':
				data = node.innerText || node.src;
				if(ndata){
					if(node.innerText) 
						node.innerText = ndata;
					else
						node.src = ndata;
				}
			break;
			case 'LINK':
			case 'IMG':
				data = node.src || '';
				if(ndata) node.src = ndata;
			break;
			case 'TEXTAREA':
			case 'INPUT':
				data = node.value;
				if(ndata) node.value = ndata;
			break;
			default:
		}
		return data;
	}

})(DomFS);


$(document).ready(function(){
	DomFS.init();
});
