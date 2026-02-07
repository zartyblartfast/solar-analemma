export type Domain = [number, number];

export function computeEnuDomainsAspectLocked(params: {
  eMin: number;
  eMax: number;
  uMin: number;
  uMax: number;
  plotWidthPx: number;
  plotHeightPx: number;
  padFraction: number;
  minPadE: number;
  minPadU: number;
  minSpan: number;
}): { eDomain: Domain; uDomain: Domain } {
  const {
    eMin,
    eMax,
    uMin,
    uMax,
    plotWidthPx,
    plotHeightPx,
    padFraction,
    minPadE,
    minPadU,
    minSpan,
  } = params;

  const safeWidth = Math.max(1, plotWidthPx);
  const safeHeight = Math.max(1, plotHeightPx);

  const eRange = Math.max(minSpan, eMax - eMin);
  const uRange = Math.max(minSpan, uMax - uMin);

  const ePad = Math.max(minPadE, eRange * padFraction);
  const uPad = Math.max(minPadU, uRange * padFraction);

  let eDomainMin = eMin - ePad;
  let eDomainMax = eMax + ePad;
  let uDomainMin = uMin - uPad;
  let uDomainMax = uMax + uPad;

  const eMid = (eDomainMin + eDomainMax) / 2;
  const uMid = (uDomainMin + uDomainMax) / 2;

  let eSpan = Math.max(minSpan, eDomainMax - eDomainMin);
  let uSpan = Math.max(minSpan, uDomainMax - uDomainMin);

  const uSpanForE = eSpan * (safeHeight / safeWidth);
  const eSpanForU = uSpan * (safeWidth / safeHeight);

  if (uSpan < uSpanForE) {
    uSpan = uSpanForE;
    uDomainMin = uMid - uSpan / 2;
    uDomainMax = uMid + uSpan / 2;
  } else if (eSpan < eSpanForU) {
    eSpan = eSpanForU;
    eDomainMin = eMid - eSpan / 2;
    eDomainMax = eMid + eSpan / 2;
  }

  return {
    eDomain: [eDomainMin, eDomainMax],
    uDomain: [uDomainMin, uDomainMax],
  };
}
