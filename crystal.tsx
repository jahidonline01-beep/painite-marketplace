export function PainiteCrystal() {
  return (
    <div className="crystal-scene" aria-hidden="true">
      <div className="crystal-scene__glow" />
      <div className="crystal-scene__ring" />
      <div className="crystal-scene__ring crystal-scene__ring--outer" />
      <div className="crystal">
        <div className="crystal__core" />
        <div className="crystal__facet crystal__facet--n" />
        <div className="crystal__facet crystal__facet--e" />
        <div className="crystal__facet crystal__facet--s" />
        <div className="crystal__facet crystal__facet--w" />
        <div className="crystal__facet crystal__facet--dn" />
        <div className="crystal__facet crystal__facet--de" />
        <div className="crystal__facet crystal__facet--ds" />
        <div className="crystal__facet crystal__facet--dw" />
      </div>
      <div className="crystal-scene__caustic" />
    </div>
  );
}
