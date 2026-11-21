import { journeyConfig } from '../../data';
import { highestUnlocked } from '../../engines/levels/levels';
import type { SaveData } from '../../services/persistence/save';
import { useGame } from '../../state/game';
import { tutorialDone } from '../../state/selectors';
import { useSession } from '../../state/session';

interface Tip {
  id: string;
  text: string;
  when: (save: SaveData, signedIn: boolean) => boolean;
}

/** One-time hints, shown as new mechanics open up. Order is priority. */
const TIPS: Tip[] = [
  {
    id: 'weapons',
    text: '🔫 Shields and weapons are now in the shop. Fire with F, X or Enter (or the 🔫 button on touch screens).',
    when: (s) => highestUnlocked(s.progress) >= 2,
  },
  {
    id: 'guardian',
    text: `👹 From Level ${journeyConfig.guardian.fromLevel}, a Guardian patrols just before the finish line. Dodge it, or blast it for ${journeyConfig.guardian.coinReward} bonus coins.`,
    when: (s) => highestUnlocked(s.progress) >= journeyConfig.guardian.fromLevel,
  },
  {
    id: 'wind',
    text: `🌬️ From Level ${journeyConfig.wind.fromLevel}, wind bands push you sideways — steer against them.`,
    when: (s) => highestUnlocked(s.progress) >= journeyConfig.wind.fromLevel,
  },
  {
    id: 'meteors',
    text: `☄️ From Level ${journeyConfig.meteorShower.fromLevel}, meteor showers rain down fast. Watch for the warning banner.`,
    when: (s) => highestUnlocked(s.progress) >= journeyConfig.meteorShower.fromLevel,
  },
  {
    id: 'missions',
    text: '🎯 Daily missions and achievements earn 💎 gems. Spend them on hull paints, flames and trails in the Shop.',
    when: () => true,
  },
  {
    id: 'upgrades',
    text: '⬆ Upgrade parts you own in the Hangar: +10% to all their stats per level, up to 3 levels.',
    when: (s) => s.stats.flights >= 2,
  },
  {
    id: 'coins',
    text: '🪙 Grab coins and ⛽ fuel cans in flight: coins add to your payout, fuel cans refill 20% of your tank.',
    when: (s) => s.stats.flights >= 1,
  },
  {
    id: 'ghost',
    text: '👻 A faint ghost of your best run on each level now flies alongside you. You can turn it off in Settings.',
    when: (s) => s.stats.flights >= 3,
  },
  {
    id: 'leaderboard',
    text: '🏆 You are signed in, so your best runs go on the per-level leaderboards. Fair play: our server re-flies every run from your recorded controls, so only real distances count.',
    when: (_s, signedIn) => signedIn,
  },
];

export function Tips() {
  const save = useGame((s) => s.save);
  const markTip = useGame((s) => s.markTip);
  const signedIn = useSession((s) => s.user !== null);
  const touring = useGame((s) => s.tour !== null);
  if (!tutorialDone(save) || touring) return null;
  const tip = TIPS.find((t) => !save.tips.includes(t.id) && t.when(save, signedIn));
  if (!tip) return null;
  return (
    <div className="coach tip" role="status" data-testid="tip">
      <span className="coach-avatar" aria-hidden>
        💡
      </span>
      <p>{tip.text}</p>
      <button type="button" className="btn small primary" onClick={() => markTip(tip.id)} data-testid="tip-dismiss">
        Got it
      </button>
    </div>
  );
}
