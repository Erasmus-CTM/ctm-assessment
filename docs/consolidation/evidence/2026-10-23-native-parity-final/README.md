# Focused parity and layout evidence

The native ZIP is split into raw binary parts, each at most180000 bytes. Reassemble in filename order from this directory:

```sh
cat native-parity-proof.zip.part01 native-parity-proof.zip.part02 native-parity-proof.zip.part03 native-parity-proof.zip.part04 > native-parity-proof-d56af5a1-full-db1f3c54.zip
sha256sum native-parity-proof-d56af5a1-full-db1f3c54.zip assessment51-focused-evidence.zip
```

Compare both hashes and every part against SHA256.json before extraction. Native archive SHA256: `be9268067f0c049144a780f42c4407dc4e93e6df8d54299c7e3c2489a9d99d07` (603660 bytes,109 ZIP entries). The assessment51 ZIP is179495 bytes, SHA256 `d73938bb5409f809c6a33461f6278185f3a8949264da210f67906dc51a8c52a1`.

The native archive includes actual full GitHub parity run40015897164 at mathdb1f3c54, its verified artifact and reports, exact published assessmentd56 sources, matching raw native contexts, source/option/context rejection controls, actual wrong-teacher exit1, and the earlier inherited false-exit0 failure. Full parity:1633 responses,38 authored source tests,267 exact directional migration expectations,0 unexpected differences and0 stale entries. All16 native candidate identities and five source hashes match local raw-context evidence;16 mandatory teacher vectors and56 authored cases pass. No approvals/history writes are made. The layout archive retains the focused assessment51 diagnostic evidence supplied by its owner; neither archive establishes final first-visit acceptance.

Historical failures are retained. No merge, deployment, tag or protected-course clearance is implied. AC alone merges.
