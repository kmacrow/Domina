#!/usr/bin/env python

from websockify import WebSocketServer
from fuse import FUSE
from DomFS import DomFS
from sys import argv, exit
from os import mkdir, rmdir
from os.path import exists, ismount
import json

"""
 The DomFS Server accepts WebSocket connections
 and then drops into FUSE_Main() to mount the 
 filesystem.
""" 

class DomFServer(WebSocketServer):
	
	def __init__(self, port, mount):
		WebSocketServer.__init__(self, listen_host = 'localhost',
									   listen_port = port)
		self.mountpt = mount

	def new_client(self):
		mnt = self.mountpt + '.' + str(self.handler_id)
		if exists(mnt):
			if ismount(mnt):
				print 'Filesystem already mounted at %s' % mnt
				return
		else:
			mkdir(mnt)

		print 'Mounting client DOM at %s' % mnt
		FUSE(DomFS(self), mnt, foreground=True)
		rmdir(mnt)
		self.send_close()
		
	def send_cmd(self, cmd, args):
		self.send_all(json.dumps({'cmd': cmd, 'args': args}))
		bufs, close = self.recv_frames()
		if close is None:
			return None
		else: 
			return json.loads(bufs[0])

	def send_all(self, buf):
		left = self.send_frames([buf])
		while left > 0:
			left = self.send_frames(None)
		return 1

	def run(self):
		self.start_server()



if __name__ == '__main__':
	print "DomFServer listening..."
	DomFServer(argv[1], argv[2]).run()
