/**
 * Echo Loop のステージ（仮）。盤面の書き方は Nova Pinball と同じ StageDef。
 * いまは Nova の序盤の盤面を借りている。Echo 専用の「1ループでは届かない」配置は EL-05 で作る。
 */
import { stages as nova, type StageDef } from '../../nova-pinball/src/stages';

const pick = (id: string, hint: string, extra: Partial<StageDef> = {}): StageDef => {
  const s = nova.find((x) => x.id === id)!;
  return { ...s, id: `echo-${id}`, hint, ...extra };
};

export const stages: StageDef[] = [
  pick('arc', '10秒で全部は無理。残りは次のループの自分に任せて、さっきと違う星を狙え'),
  pick('corona', '過去の自分が灯した星を、今の自分が点火する'),
  pick('spiral', '残響の軌道を覚えて、ぶつからないように打て'),
  pick('drift', '漂う星は残響の通り道を変える。過去が書き換わったら軌跡が赤く光る'),
  pick('gemini', '左右に分かれた星座。ループごとに受け持ちを決めろ'),
];
