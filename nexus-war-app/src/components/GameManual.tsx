import React from 'react';
import { X, Skull, Zap, Shield, Database, Search, Cpu, Terminal, AlertTriangle, RotateCcw } from 'lucide-react';

interface IGameManualProps {
    onClose: () => void;
}

const GameManual: React.FC<IGameManualProps> = ({ onClose }) => {
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="manual-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <Terminal size={18} /> <span>SKY-MAGYCC JUDAS：マニュアル</span>
                    <button className="modal-close" onClick={onClose}><X size={16} /></button>
                </div>

                <div className="manual-content">
                    {/* 概要 */}
                    <section className="manual-section">
                        <h3><Shield size={16} /> ゲームの目的</h3>
                        <p>このゲームは、企業インフラを守る「社員」と、それを破壊せんとする「ハッカー」、そして内部から混乱を招く「殺人犯」の、3つ巴の戦いです。</p>

                        <div className="victory-grid">
                            <div className="victory-card defense">
                                <h4>社員の勝利条件</h4>
                                <ul>
                                    <li>8ターン終了後、「殺人犯」および「ハッカー」の両方を完全に特定（最終投票）する</li>
                                </ul>
                            </div>
                            <div className="victory-card murderer">
                                <h4>殺人犯の勝利条件</h4>
                                <ul>
                                    <li>8ターン終了後、「殺人犯」として特定（最終投票）されないこと</li>
                                </ul>
                            </div>
                            <div className="victory-card hacker">
                                <h4>ハッカーの勝利条件</h4>
                                <ul>
                                    <li>サーバーHPを0%にする</li>
                                    <li>または、データ漏洩（LEAK）を100%にする</li>
                                </ul>
                            </div>
                        </div>

                        <div className="draw-box" style={{ marginTop: '1rem', padding: '0.8rem', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '4px', border: '1px dashed rgba(255, 255, 255, 0.2)' }}>
                            <h4 style={{ fontSize: '0.85rem', color: '#fff', marginBottom: '0.5rem' }}>引き分け（業務継続不可）</h4>
                            <p style={{ fontSize: '0.75rem', color: '#bbb' }}>以下の場合は社員の敗北、または引き分けとなります：</p>
                            <ul style={{ fontSize: '0.75rem', color: '#bbb', paddingLeft: '1.2rem', marginTop: '4px' }}>
                                <li>社員が最終投票で殺人犯とハッカーを特定できなかった場合</li>
                                <li>殺人犯は特定されたが、ハッカーを特定できなかった場合</li>
                                <li>※ハッカーが勝利条件を満たしていない場合でも、特定できなければ引き分け</li>
                            </ul>
                        </div>
                    </section>

                    {/* ターンの流れ */}
                    <section className="manual-section">
                        <h3><RotateCcw size={16} /> ターンの流れ</h3>
                        <div className="phase-item">
                            <span className="phase-label">行動・議論・投票</span>
                            <p>1ターンの定められた時間内で「議論」「行動」「投票」を並行して行います。</p>
                            <ul style={{ fontSize: '0.8rem', color: '#ccc', marginTop: '8px', borderLeft: '2px solid #ffcc00', paddingLeft: '12px' }}>
                                <li><strong>アクションの待機</strong>：アクションは実行指示から<span style={{ color: '#ffcc00' }}>完了まで10秒間</span>必要です。効果は完了後に発動します。</li>
                                <li><strong>妨害プロトコル</strong>：殺人犯は作業妨害が可能です。作業中の10秒間に殺人犯が**[パケット無効化]**を実施すると、現在進行中の全アクションが強制キャンセルされます。</li>
                                <li style={{ color: '#ffcc00', marginTop: '4px', fontStyle: 'italic' }}>※終了間際はアクションの入力が締め切られます（目安：残り時間 8% / 10分ターンの場合は残り50秒）。</li>
                            </ul>
                        </div>
                    </section>

                    {/* 基本パラメータ */}
                    <section className="manual-section">
                        <h3><AlertTriangle size={16} /> 基本パラメータ</h3>
                        <table className="manual-table">
                            <tbody>
                                <tr>
                                    <th><Cpu size={14} /> システムHP</th>
                                    <td>サーバーの耐久度。0%になるとハッカー勝利。社員は修復可能です。</td>
                                </tr>
                                <tr>
                                    <th><Database size={14} /> 漏洩率 (LEAK)</th>
                                    <td>データの流出状態。100%になるとハッカー勝利。社員は暗号化で阻止できます。</td>
                                </tr>
                                <tr>
                                    <th><Search size={14} /> 解析率 (ANALYSIS)</th>
                                    <td>殺人犯の証拠。100%に達すると自動的に殺人犯が特定されます。</td>
                                </tr>
                                <tr>
                                    <th><Zap size={14} /> AP (コスト)</th>
                                    <td>行動に必要なポイント。通常1ターンに3AP回復します。</td>
                                </tr>
                            </tbody>
                        </table>
                    </section>

                    {/* 陣営の役割 */}
                    <section className="manual-section">
                        <h3><Skull size={16} /> 役割と能力</h3>
                        <div className="role-summary">
                            <div className="role-box defense">
                                <strong>社員 (4名)</strong>
                                <p>システムを守るエンジニア。システム修復や暗号化、ログ調査による犯人特定。職業ごとに強力な固有スキルを持ちます。</p>
                            </div>
                            <div className="role-box hacker">
                                <strong>ハッカー (1名)</strong>
                                <p>攻撃のプロ。社員の中に1人潜んでいます。偽装工作で社員を装いつつ、秘密裏にサーバーを破壊またはデータを窃取します。</p>
                            </div>
                            <div className="role-box murderer">
                                <strong>殺人犯 (1名)</strong>
                                <p>混乱の源。社員の中に1人潜んでいます。ハッカーの攻撃に乗じてシステムの破壊を加速させたり、調査を妨害したりします。</p>
                            </div>
                        </div>
                    </section>

                    {/* 投票システム */}
                    <section className="manual-section">
                        <h3>投票システム</h3>
                        <p>議論フェーズ中に疑わしい人物に投票できます。最も票を集めたプレイヤーは、<strong>次ターンの行動（AP）が制限</strong>されます。慎重に、かつ大胆に告発しましょう。</p>
                        <p style={{ fontSize: '0.8rem', color: '#888', fontStyle: 'italic', marginTop: '4px' }}>※最多得票が複数の場合は、証拠不十分として無効となります。</p>
                    </section>
                </div>

                <div className="modal-footer">
                    <button className="btn-action" onClick={onClose} style={{ background: '#00ff88', color: '#000' }}>ミッションに戻る</button>
                </div>
            </div >
        </div >
    );
};

export default GameManual;
