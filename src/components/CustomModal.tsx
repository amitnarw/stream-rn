import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../theme';

interface CustomModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  message: string;
  confirmText?: string;
  onConfirm?: () => void;
  glowColors?: readonly [string, string, ...string[]];
  Icon?: React.ComponentType<{ size: number; color: string }>;
  iconColor?: string;
  iconBgColor?: string;
  confirmDestructive?: boolean;
  children?: React.ReactNode;
  /** When false, tapping outside the card does NOT dismiss the modal. */
  dismissable?: boolean;
  /** Visual variant. "dark" (default) for dark backgrounds like detail/settings screens;
   *  "light" for bright video content behind the player. */
  variant?: 'light' | 'dark';
}

export function CustomModal({
  visible,
  onClose,
  title,
  message,
  confirmText,
  onConfirm,
  glowColors = ['rgba(255, 74, 125, 0.15)', 'transparent'],
  Icon,
  iconColor = '#ff4a7d',
  iconBgColor = 'rgba(255, 74, 125, 0.1)',
  confirmDestructive = false,
  children,
  dismissable = true,
  variant = 'dark',
}: CustomModalProps) {
  const isConfirmMode = !!confirmText && !!onConfirm;
  const isLight = variant === 'light';

  const cardBg = isLight ? theme.colors.lightGlass.cardBg : '#121214';
  const cardBorder = isLight ? theme.colors.lightGlass.cardBorder : 'rgba(255, 255, 255, 0.08)';
  const textColor = '#ffffff';
  const textMuted = isLight ? theme.colors.lightGlass.textMuted : '#a0a0a5';
  const rowInactiveBg = isLight ? theme.colors.lightGlass.rowInactive : 'rgba(255, 255, 255, 0.05)';
  const rowBorder = isLight ? theme.colors.lightGlass.rowBorder : 'rgba(255, 255, 255, 0.08)';
  const scrimColor = isLight ? theme.colors.lightGlass.backdropDim : 'rgba(0, 0, 0, 0.75)';

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={dismissable ? onClose : () => {}}
      statusBarTranslucent={true}
    >
      <View style={[styles.modalOverlay, { backgroundColor: scrimColor }]}>
        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={dismissable ? onClose : undefined}
        />
        <View
          style={[styles.modalContent, { backgroundColor: cardBg, borderColor: cardBorder }]}
          pointerEvents="box-none"
        >
          {/* Soft top light glow */}
          <LinearGradient
            colors={glowColors}
            style={styles.modalGlow}
            pointerEvents="none"
          />

          <View style={styles.modalHeader}>
            {Icon && (
              <View style={[styles.iconContainer, { backgroundColor: iconBgColor }]}>
                <Icon size={22} color={iconColor} />
              </View>
            )}
            <Text style={[styles.modalTitle, { color: textColor }]}>{title}</Text>
          </View>

          <Text style={[styles.modalMessage, { color: textMuted }]}>{message}</Text>

          {children ? (
            children
          ) : isConfirmMode ? (
            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { backgroundColor: rowInactiveBg, borderColor: rowBorder }]}
                onPress={onClose}
                activeOpacity={0.7}
              >
                <Text style={[styles.modalCancelBtnText, { color: textColor }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalConfirmBtn,
                  confirmDestructive ? styles.modalConfirmBtnDestructive : styles.modalConfirmBtnPrimary,
                ]}
                onPress={() => {
                  onClose();
                  if (onConfirm) onConfirm();
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.modalConfirmBtnText}>{confirmText}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.modalOkBtn, { backgroundColor: rowInactiveBg, borderColor: rowBorder }]}
              onPress={onClose}
              activeOpacity={0.8}
            >
              <Text style={[styles.modalOkBtnText, { color: textColor }]}>OK</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '85%',
    borderWidth: 1,
    borderRadius: 24,
    overflow: 'hidden',
    padding: 24,
  },
  modalGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalMessage: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 24,
  },
  modalButtonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalCancelBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  modalCancelBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  modalConfirmBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalConfirmBtnDestructive: {
    backgroundColor: 'rgba(255, 74, 125, 0.35)',
  },
  modalConfirmBtnPrimary: {
    backgroundColor: theme.colors.accent,
  },
  modalConfirmBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  modalOkBtn: {
    borderWidth: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOkBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
