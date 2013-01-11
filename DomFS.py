#!/usr/bin/env python

"""
	DomFS FUSE Implementation. Most operations are
    implemented as RPCs into the connected web page.
"""

import logging

from collections import defaultdict
from errno import ENOENT
from stat import S_IFDIR, S_IFLNK, S_IFREG
from time import time

from fuse import FUSE, FuseOSError, Operations, LoggingMixIn

class DomFS(LoggingMixIn, Operations):
    'DomFS FUSE Implementation'

    def __init__(self, backend):
    	self.fd = 0
    	self.backend = backend

    def rpc(self, cmd, args):
        return self.backend.send_cmd(cmd, args)

    def chmod(self, path, mode):
        self.rpc('chmod', [path, mode])
        return 0

    def chown(self, path, uid, gid):
        self.rpc('chown', [path, uid, gid])

    def create(self, path, mode):
        self.rpc('create', [path, mode])
        self.fd += 1
    	return self.fd

    def getattr(self, path, fh=None):
        res = self.rpc('getattr', [path, None])
        if res is None or type(res) != dict:
            raise FuseOSError(ENOENT)
        else:
            return res

    def getxattr(self, path, name, position=0):
    	return self.rpc('getxattr', [path, name])

    def listxattr(self, path):
    	return self.rpc('listxattr', [path])

    def mkdir(self, path, mode):
    	self.rpc('mkdir', [path, mode])

    def open(self, path, flags):
    	self.fd += 1
        return self.fd

    def read(self, path, size, offset, fh):
    	data = self.rpc('read', [path, size, offset])
        return data.decode("utf-8").encode("ascii", "ignore")

    def readdir(self, path, fh):
    	return self.rpc('readdir', [path, None])

    def readlink(self, path):
    	return ''

    def removexattr(self, path, name):
    	self.rpc('removexattr', [path, name])

    def rename(self, oldp, newp):
    	self.rpc('rename', [oldp, newp])

    def rmdir(self, path):
    	self.rpc('rmdir', [path])

    def setxattr(self, path, name, value, options, position=0):
    	self.rpc('setxattr', [path, name, value])

    def statfs(self, path):
    	return dict(f_bsize=512, f_blocks=4096, f_bavail=2048)

    def symlink(self, target, source):
    	self.rpc('symlink', [target, source])

    def unlink(self, path):
    	self.rpc('unlink', [path])

    def utimens(self, path, times=None):
        self.rpc('utimens', [path, times])

    def truncate(self, path, length, fh=None):
        self.rpc('truncate', [path, length])

    def write(self, path, data, offset, fh):
    	return self.rpc('write', [path, data, offset, fh])
    	