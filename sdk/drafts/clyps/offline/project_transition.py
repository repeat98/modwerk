# SPDX-License-Identifier: GPL-3.0-or-later
"""Host model for a proposed serialized stock project transaction."""
from dataclasses import dataclass


@dataclass(frozen=True)
class Generation:
    project: bytes
    bank: int
    rows: tuple
    epoch: int
    playing: int = 0
    queued: int = 0


    @property
    def binding(self):
        return (self.project, self.bank, self.epoch)


class Transition:
    def __init__(self, committed):
        self.committed = committed
        self.serial = 0
        self.pending = None
        self.available = True

    def begin(self, project):
        self.serial += 1
        self.pending = project
        self.available = False
        return self.serial

    def finish(self, serial, stock_binding, staged=None):
        """None means abort. Stock certifies which incarnation is usable again."""
        if self.pending is None or serial != self.serial:
            raise ValueError("stale completion")
        if staged is None:
            self.available = stock_binding == self.committed.binding
        elif stock_binding == staged.binding and self.pending == staged.project:
            self.committed = staged
            self.available = True
        else:
            raise ValueError("unqualified destination")
        self.pending = None

    def selected(self):
        return self.committed if self.available else None
