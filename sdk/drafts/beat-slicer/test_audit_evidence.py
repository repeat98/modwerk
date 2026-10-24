"""Regression checks for explicit module and external SDK evidence identities."""
import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import audit_evidence as audit

MODULE_REV='1'*40
SDK_REV='2'*40
LOCAL=b'original module input\n'
SDK=b'original SDK input\n'
GUARD=b'original code-generation guard\n'
def sha(data):return hashlib.sha256(data).hexdigest()
class EvidenceTests(unittest.TestCase):
    def run_report(self,report,noncommit=False):
        with tempfile.TemporaryDirectory(prefix='beat-slicer-evidence-') as work:
            root=Path(work);(root/'evidence').mkdir()
            (root/'evidence/test.json').write_text(json.dumps(report))
            index=root/'index.json';index.write_text(json.dumps({'schemaVersion':1,'bindings':{'test.json':MODULE_REV}}))
            def git(*args):
                if args[0]=='cat-file':return b'blob' if noncommit and args[2]==SDK_REV else b'commit'
                key=args[1]
                values={MODULE_REV+':module/input.c':LOCAL,SDK_REV+':sdk/runtime/loader/loader.c':SDK,
                        SDK_REV+':sdk/runtime/m68k_codegen.py':GUARD,
                        MODULE_REV+':module/sdk/runtime/loader/loader.c':LOCAL,
                        MODULE_REV+':sdk/runtime/loader/loader.c':SDK}
                self.assertIn(key,values)
                return values[key]
            with patch.object(audit,'ROOT',root),patch.object(audit,'PREFIX','module/'),patch.object(audit,'git',git):
                return audit.audit(index)
    def report(self):
        return {'sourceSha256':{'input.c':sha(LOCAL)},'sdkRevision':SDK_REV,
                'sdkDependencySha256':{'sdk/runtime/loader/loader.c':sha(SDK)},'codegenGuardSha256':sha(GUARD)}
    def test_exact_sources_and_optional_legacy_report(self):
        self.assertEqual(self.run_report(self.report()),(1,3,0))
        self.assertEqual(self.run_report({'sourceSha256':{'input.c':sha(LOCAL)}}),(1,1,0))
    def test_sdk_fields_are_paired_and_nonempty(self):
        for field in ('sdkRevision','sdkDependencySha256'):
            with self.subTest(field=field):
                r=self.report();del r[field]
                with self.assertRaises(ValueError):self.run_report(r)
        r=self.report();r['sdkDependencySha256']={}
        with self.assertRaisesRegex(ValueError,'nonempty'):self.run_report(r)
    def test_exact_revision_and_commit_type(self):
        for value in ('main','2'*39,123,None):
            with self.subTest(value=value):
                r=self.report();r['sdkRevision']=value
                with self.assertRaises(ValueError):self.run_report(r)
        with self.assertRaisesRegex(ValueError,'not a commit'):self.run_report(self.report(),True)
    def test_sdk_paths_are_bounded(self):
        for path in ('/sdk/runtime/x','sdk/runtime/../x','sdk/runtime//x','sdk/other/x'):
            with self.subTest(path=path):
                r=self.report();r['sdkDependencySha256']={path:sha(SDK)}
                with self.assertRaises(ValueError):self.run_report(r)
    def test_wrong_module_sdk_or_guard_hash_is_refused(self):
        for field in ('sourceSha256','sdkDependencySha256','codegenGuardSha256'):
            with self.subTest(field=field):
                r=copy.deepcopy(self.report())
                if isinstance(r[field],dict):r[field][next(iter(r[field]))]='0'*64
                else:r[field]='0'*64
                with self.assertRaisesRegex(ValueError,'mismatch'):self.run_report(r)
    def test_cache_separates_module_relative_and_repository_paths(self):
        r={'sourceSha256':{'sdk/runtime/loader/loader.c':sha(LOCAL)},'sdkRevision':MODULE_REV,
           'sdkDependencySha256':{'sdk/runtime/loader/loader.c':sha(SDK)}}
        self.assertEqual(self.run_report(r),(1,2,0))
        r['sdkDependencySha256']['sdk/runtime/loader/loader.c']=sha(LOCAL)
        with self.assertRaisesRegex(ValueError,'SDK source mismatch'):self.run_report(r)
    def test_invalid_sdk_hash_is_refused(self):
        for value in ('no digest','f'*63,False):
            with self.subTest(value=value):
                r=self.report();r['sdkDependencySha256']['sdk/runtime/loader/loader.c']=value
                with self.assertRaisesRegex(ValueError,'SHA-256'):self.run_report(r)
if __name__=='__main__':unittest.main()
